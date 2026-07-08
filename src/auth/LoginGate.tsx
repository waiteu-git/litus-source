import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  CLASS_PC_LOGIN_URL,
  COLLECT_TIMETABLE_JS,
  DESKTOP_UA,
  DETECT_PAGE_JS,
  OPEN_TIMETABLE_JS,
} from '../collect/injectedScripts'
import { parseCollectionMessage } from '../collect/timetableMessage'
import { loadTimetable, saveTimetable } from '../storage/timetableStore'
import {
  isTimetableStale,
  loadTimetableRefreshedAt,
  saveTimetableRefreshedAt,
} from '../storage/refreshMetaStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { loadOnboardingDone, saveOnboardingDone } from '../storage/onboardingStore'
import { classifyGatePage, type GateVerdict } from './classifyGatePage'
import { syncSession } from '../collect/syncSession'
import LetusSyncEngine from '../collect/LetusSyncEngine'
import OnboardingSlides from '../screens/OnboardingSlides'
import { BOOT_LOGO_GREEN, BOOT_LOGO_WHITE } from '../screens/bootLogoHtml'
import { loadBootLogo } from '../storage/bootLogoStore'
import type { BootLogoVariant } from '../storage/bootLogoSerialize'
import { COLORS } from '../theme'

// checking中に本物のログイン状態が判定できない場合の保険（リダイレクト完了待ち）。
const CHECK_TIMEOUT_MS = 12000
// setup（時間割自動取り込み）が進まない場合は諦めて入場する（手動収集にフォールバック）。
const SETUP_TIMEOUT_MS = 25000
// setup中、ページ読込後に時間割テーブル抽出を試みるまでの待ち。
const SETUP_COLLECT_DELAY_MS = 900
// 初回フル同期（コース→スナップショット→課題）の上限。超えたら入場し裏で再試行に任せる。
const SYNC_TIMEOUT_MS = 180000

type GateState = 'loading' | 'firstRun' | 'checking' | 'needsLogin' | 'setup' | 'sync' | 'authed'

const LoginContext = createContext<{ requireLogin: () => void }>({ requireLogin: () => {} })

/** 画面側からセッション切れ時に再ログインを要求する。 */
export function useLoginGate() {
  return useContext(LoginContext)
}

/**
 * 起動ゲート。初回はチュートリアル（スライド→本物のSSOログイン全面表示・こちらのUIで包まない）、
 * 2回目以降は翠の起動画面でCLASSセッションを確認し、確認でき次第タブへ入場する。
 *
 * probe は入口スプラッシュを踏まず **ShibbolethAuthServlet（PC ENTERの行き先）を直接開く**:
 * セッション有→ポータル到達=authed / 無→Microsoftログインへリダイレクト=needsLogin（URL判定）。
 * スプラッシュは未ログインでも表示される公開ページなので判定に使わない（classifyGatePage参照）。
 *
 * ログイン完了後、時間割が未保存なら setup フェーズでゲートのWebView（この時点でアプリ唯一の
 * CLASS view）から時間割を自動取り込みしてから入場する（失敗しても入場は続行・手動収集で補える）。
 * 認証情報は保存しない。セッション切れは各画面が requireLogin() で再表示させる。
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<GateState>('loading')
  const [nonce, setNonce] = useState(0)
  const webviewRef = useRef<WebView>(null)
  // コールバック（onLoadEnd/onMessage/タイマー）から最新stateを読むためのref。
  const stateRef = useRef<GateState>('loading')
  stateRef.current = state
  // firstRun 中に届いた判定を保持し、スライド完了時に即適用する。
  const lastResultRef = useRef<GateVerdict | null>(null)
  // setup での時間割メニュー再試行回数（無限リトライ防止）。
  const setupTriesRef = useRef(0)
  // 自動復帰（ロード失敗/クラッシュ/SAML stale/LETUS迷子）の回数上限（無限ループ防止）。
  const recoverTriesRef = useRef(0)
  // この起動が初回チュートリアル経由か（初回のみフル同期を可視で行う）。
  const wasFirstRunRef = useRef(false)
  // 初回フル同期の進捗表示。
  const [syncLabel, setSyncLabel] = useState('データを取り込んでいます…')
  // 起動ロゴアニメの背景バリアント（green=翠グラデ／white=白）。
  const [bootLogo, setBootLogo] = useState<BootLogoVariant>('green')

  useEffect(() => {
    loadBootLogo()
      .then(setBootLogo)
      .catch(() => undefined)
    loadOnboardingDone()
      .then((done) => {
        if (!done) wasFirstRunRef.current = true
        setState(done ? 'checking' : 'firstRun')
      })
      .catch(() => setState('checking'))
  }, [])

  useEffect(() => {
    if (state !== 'checking') return
    const t = setTimeout(() => setState((s) => (s === 'checking' ? 'needsLogin' : s)), CHECK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [state, nonce])

  // ログイン成功（setup/sync到達含む）＝チュートリアル完了として永続化。
  useEffect(() => {
    if (state === 'authed' || state === 'setup' || state === 'sync') {
      saveOnboardingDone().catch(() => undefined)
    }
  }, [state])

  // sync: 初回フル同期が進まない場合は諦めて入場（裏のBackgroundLetusSyncが後で再試行）。
  useEffect(() => {
    if (state !== 'sync') return
    const t = setTimeout(() => setState((s) => (s === 'sync' ? 'authed' : s)), SYNC_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [state])

  // setup: 時間割ページへ自動遷移して取り込み。タイムアウトで諦めて入場（ブロックしない）。
  useEffect(() => {
    if (state !== 'setup') return
    setupTriesRef.current = 0
    webviewRef.current?.injectJavaScript(OPEN_TIMETABLE_JS)
    const collect = setTimeout(
      () => webviewRef.current?.injectJavaScript(COLLECT_TIMETABLE_JS),
      2500,
    )
    const giveUp = setTimeout(() => setState((s) => (s === 'setup' ? afterSetup() : s)), SETUP_TIMEOUT_MS)
    return () => {
      clearTimeout(collect)
      clearTimeout(giveUp)
    }
  }, [state])

  function requireLogin() {
    lastResultRef.current = null
    setNonce((n) => n + 1)
    setState('checking')
  }

  /**
   * WebViewの自動復帰: nonce を上げて作り直す（probe URLもキャッシュバスターが変わる）。
   * ロード失敗（chrome-error）・レンダラクラッシュ・SAML「過去のリクエスト」・LETUS迷子で使う。
   * 上限を超えたら needsLogin（可視WebView＋再読み込みボタン）に落として手動復帰へ。
   */
  function recover() {
    if (recoverTriesRef.current >= 3) {
      setState('needsLogin')
      return
    }
    recoverTriesRef.current += 1
    setNonce((n) => n + 1)
    setState((s) => (s === 'firstRun' || s === 'loading' ? s : 'checking'))
  }

  /** setup（時間割）完了後の遷移先。初回はフル同期（コース→課題）も可視で済ませる。 */
  function afterSetup(): GateState {
    return wasFirstRunRef.current && !syncSession.didFullSync ? 'sync' : 'authed'
  }

  /**
   * ログイン確認後の入場処理。時間割が未保存、または前回更新から時間が経っていれば setup
   * （CLASS画面を見せない裏取得）を挟む。ここはタブ・出席WebViewが未マウントの段階なので
   * CLASSの競合が起きない＝時間割の自動更新に最適なタイミング。
   */
  function proceedToEntry() {
    Promise.all([loadTimetable(), loadTimetableRefreshedAt()])
      .then(([t, at]) => {
        const need = !t || t.length === 0 || isTimetableStale(at)
        setState(need ? 'setup' : afterSetup())
      })
      .catch(() => setState('authed'))
  }

  function onSlidesDone() {
    if (lastResultRef.current === 'authed') proceedToEntry()
    else if (lastResultRef.current === 'needsLogin') setState('needsLogin')
    else setState('checking')
  }

  function onLoadEnd() {
    webviewRef.current?.injectJavaScript(DETECT_PAGE_JS)
    // setup中はメニュー遷移後のページで時間割テーブルの抽出も試みる。
    if (stateRef.current === 'setup') {
      setTimeout(() => {
        if (stateRef.current === 'setup') webviewRef.current?.injectJavaScript(COLLECT_TIMETABLE_JS)
      }, SETUP_COLLECT_DELAY_MS)
    }
  }

  function onMessage(data: string) {
    let p: Record<string, unknown> | null = null
    try {
      p = JSON.parse(data)
    } catch {
      return
    }
    if (!p) return
    if (p.type === 'page') {
      const verdict = classifyGatePage({
        hasPasswordInput: !!p.hasPasswordInput,
        hasClassMenu: !!p.hasClassMenu,
        hasEnterSplash: !!p.hasEnterSplash,
        hasSsoStale: !!p.hasSsoStale,
        url: typeof p.url === 'string' ? p.url : undefined,
      })
      if (verdict === 'pending') return // リダイレクト途中は待つ
      if (verdict === 'stale' || verdict === 'stray') {
        // SAMLリプレイ拒否 or SSO混線でLETUS着地 → WebViewを作り直して新しいSAMLフローで再試行。
        recover()
        return
      }
      lastResultRef.current = verdict
      if (verdict === 'authed') recoverTriesRef.current = 0
      const s = stateRef.current
      if (s === 'checking') {
        if (verdict === 'authed') proceedToEntry()
        else setState('needsLogin')
      } else if (s === 'needsLogin' && verdict === 'authed') {
        // 可視ログイン完了を検知して入場へ。
        proceedToEntry()
      }
      return
    }
    if (p.type === 'timetable' && stateRef.current === 'setup') {
      const result = parseCollectionMessage(data)
      if (!result.error && result.collections.length > 0) {
        ;(async () => {
          try {
            await saveTimetable(result.collections)
            await saveTimetableRefreshedAt()
            await refreshAllNotifications()
          } catch {
            // 保存失敗でも入場は続行（手動収集で補える）
          }
          setState((s) => (s === 'setup' ? afterSetup() : s))
        })()
      } else if (setupTriesRef.current < 3) {
        // まだ時間割ページに居ない（テーブル0件）→ メニュー発火をやり直す。
        setupTriesRef.current += 1
        webviewRef.current?.injectJavaScript(OPEN_TIMETABLE_JS)
      } else {
        setState((s) => (s === 'setup' ? afterSetup() : s))
      }
      return
    }
    // type:'nav' は診断用（段階ログ）。ゲートでは無視する。
  }

  if (state === 'authed') {
    return <LoginContext.Provider value={{ requireLogin }}>{children}</LoginContext.Provider>
  }

  const showLoginUi = state === 'needsLogin'
  const bootStatus =
    state === 'loading'
      ? '起動しています…'
      : state === 'setup'
        ? '時間割を取り込んでいます…'
        : state === 'sync'
          ? syncLabel
          : 'CLASSに接続しています…'
  return (
    <LoginContext.Provider value={{ requireLogin }}>
      <View style={styles.root}>
        {showLoginUi ? (
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>ログイン</Text>
                <Text style={styles.sub}>TUSアカウントでログインしてください（認証情報は保存しません）</Text>
              </View>
              <Pressable
                style={styles.reloadBtn}
                onPress={() => {
                  recoverTriesRef.current = 0
                  requireLogin()
                }}
              >
                <Text style={styles.reloadBtnText}>再読み込み</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={showLoginUi ? styles.webBox : styles.webHidden}>
          <WebView
            key={nonce}
            ref={webviewRef}
            // キャッシュ無効＋nonceのキャッシュバスター: ShibbolethAuthServletの302（SAMLRequest付き）が
            // キャッシュ再生されると IdP が「過去のリクエスト」で恒久拒否するため（実機で確認）。
            source={{ uri: `${CLASS_PC_LOGIN_URL}?litus=${nonce}` }}
            cacheEnabled={false}
            userAgent={DESKTOP_UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onLoadEnd={onLoadEnd}
            onMessage={(e) => onMessage(e.nativeEvent.data)}
            onError={() => recover()}
            onHttpError={(e) => {
              if (e.nativeEvent.statusCode >= 500) recover()
            }}
            onRenderProcessGone={() => recover()}
            style={styles.webviewFill}
          />
        </View>
        {state === 'sync' ? (
          <LetusSyncEngine
            onProgress={setSyncLabel}
            onFinished={() => {
              syncSession.didFullSync = true
              setState((s) => (s === 'sync' ? 'authed' : s))
            }}
          />
        ) : null}
        {state === 'loading' || state === 'checking' || state === 'setup' || state === 'sync' ? (
          <View style={styles.boot}>
            {/* 起動ロゴアニメ（純CSS・ローカルHTML）。裏でログイン/取得が進む間ずっと表示。
                タッチは奪わない（下のオーバーレイ操作を妨げない）。 */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <WebView
                source={{ html: bootLogo === 'white' ? BOOT_LOGO_WHITE : BOOT_LOGO_GREEN }}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                overScrollMode="never"
                // 翠版は自前でグラデ背景を描く。白版は白。読込中の一瞬の下地を合わせる。
                style={{ backgroundColor: bootLogo === 'white' ? '#ffffff' : COLORS.gradBottom }}
              />
            </View>
            {/* 接続状況（アニメ完了後も長い待ちで固まって見えないよう）。背景色に応じて可読色に。 */}
            <View style={styles.bootStatusWrap} pointerEvents="none">
              <ActivityIndicator color={bootLogo === 'white' ? '#8a968f' : 'rgba(255,255,255,0.9)'} />
              <Text
                style={[styles.bootStatusText, { color: bootLogo === 'white' ? '#8a968f' : 'rgba(255,255,255,0.92)' }]}
              >
                {bootStatus}
                {state === 'sync' ? '（初回のみ・少し時間がかかります）' : ''}
              </Text>
            </View>
          </View>
        ) : null}
        {state === 'firstRun' ? (
          <View style={StyleSheet.absoluteFill}>
            <OnboardingSlides onDone={onSlidesDone} />
          </View>
        ) : null}
      </View>
    </LoginContext.Provider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: COLORS.emerald, paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '600' },
  sub: { color: '#eafff7', fontSize: 13, marginTop: 4 },
  reloadBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reloadBtnText: { color: '#ffffff', fontSize: 13 },
  webBox: { flex: 1 },
  // 判定用に読み込みは続けるが画面には出さない（サイズ0だと読み込まれない端末があるため1x1）。
  webHidden: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
  webviewFill: { flex: 1 },
  boot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // 起動ロゴの © フッター（bottom ~40px）に被らないよう、その少し上に接続状況を出す。
  bootStatusWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 84,
    alignItems: 'center',
    gap: 8,
  },
  bootStatusText: { fontSize: 12, letterSpacing: 0.04 * 12 },
})
