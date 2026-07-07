import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { LinearGradient } from 'expo-linear-gradient'
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
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { loadOnboardingDone, saveOnboardingDone } from '../storage/onboardingStore'
import { classifyGatePage, type GateVerdict } from './classifyGatePage'
import OnboardingSlides from '../screens/OnboardingSlides'
import { COLORS } from '../theme'

// checking中に本物のログイン状態が判定できない場合の保険（リダイレクト完了待ち）。
const CHECK_TIMEOUT_MS = 12000
// setup（時間割自動取り込み）が進まない場合は諦めて入場する（手動収集にフォールバック）。
const SETUP_TIMEOUT_MS = 25000
// setup中、ページ読込後に時間割テーブル抽出を試みるまでの待ち。
const SETUP_COLLECT_DELAY_MS = 900

type GateState = 'loading' | 'firstRun' | 'checking' | 'needsLogin' | 'setup' | 'authed'

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

  useEffect(() => {
    loadOnboardingDone()
      .then((done) => setState(done ? 'checking' : 'firstRun'))
      .catch(() => setState('checking'))
  }, [])

  useEffect(() => {
    if (state !== 'checking') return
    const t = setTimeout(() => setState((s) => (s === 'checking' ? 'needsLogin' : s)), CHECK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [state, nonce])

  // ログイン成功（setup到達含む）＝チュートリアル完了として永続化。
  useEffect(() => {
    if (state === 'authed' || state === 'setup') saveOnboardingDone().catch(() => undefined)
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
    const giveUp = setTimeout(() => setState((s) => (s === 'setup' ? 'authed' : s)), SETUP_TIMEOUT_MS)
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

  /** ログイン確認後の入場処理。時間割が未保存なら setup（自動取り込み）を挟む。 */
  function proceedToEntry() {
    loadTimetable()
      .then((t) => setState(t && t.length > 0 ? 'authed' : 'setup'))
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
        url: typeof p.url === 'string' ? p.url : undefined,
      })
      if (verdict === 'pending') return // リダイレクト途中は待つ
      lastResultRef.current = verdict
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
            await refreshAllNotifications()
          } catch {
            // 保存失敗でも入場は続行（手動収集で補える）
          }
          setState((s) => (s === 'setup' ? 'authed' : s))
        })()
      } else if (setupTriesRef.current < 3) {
        // まだ時間割ページに居ない（テーブル0件）→ メニュー発火をやり直す。
        setupTriesRef.current += 1
        webviewRef.current?.injectJavaScript(OPEN_TIMETABLE_JS)
      } else {
        setState((s) => (s === 'setup' ? 'authed' : s))
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
        : 'CLASSに接続しています…'
  return (
    <LoginContext.Provider value={{ requireLogin }}>
      <View style={styles.root}>
        {showLoginUi ? (
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.title}>ログイン</Text>
            <Text style={styles.sub}>TUSアカウントでログインしてください（認証情報は保存しません）</Text>
          </View>
        ) : null}
        <View style={showLoginUi ? styles.webBox : styles.webHidden}>
          <WebView
            key={nonce}
            ref={webviewRef}
            source={{ uri: CLASS_PC_LOGIN_URL }}
            userAgent={DESKTOP_UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onLoadEnd={onLoadEnd}
            onMessage={(e) => onMessage(e.nativeEvent.data)}
            style={styles.webviewFill}
          />
        </View>
        {state === 'loading' || state === 'checking' || state === 'setup' ? (
          <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={styles.boot}>
            <Text style={styles.bootLogo}>リタス</Text>
            <Text style={styles.bootSub}>Litus — 東京理科大 非公式アプリ</Text>
            <ActivityIndicator color="#ffffff" style={styles.bootSpin} />
            <Text style={styles.bootStatus}>{bootStatus}</Text>
          </LinearGradient>
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
  title: { color: '#ffffff', fontSize: 20, fontWeight: '600' },
  sub: { color: '#eafff7', fontSize: 13, marginTop: 4 },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootLogo: { color: '#ffffff', fontSize: 40, fontWeight: '800', letterSpacing: 2 },
  bootSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6 },
  bootSpin: { marginTop: 28 },
  bootStatus: { color: '#eafff7', fontSize: 13, marginTop: 10 },
})
