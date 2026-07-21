import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, useColorScheme, View } from 'react-native'
import { Text } from '../ui/Text'
import { WebView, type WebViewInstance } from '../ui/GuardedWebView'
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
import { isRecoverPreserved, recoverPlan } from './gateRecovery'
import { syncSession } from '../collect/syncSession'
import LetusSyncEngine from '../collect/LetusSyncEngine'
import OnboardingSlides from '../screens/OnboardingSlides'
import TermsConsentScreen from '../screens/TermsConsentScreen'
import { TERMS_VERSION } from '../legal/termsVersion'
import { loadAcceptedTermsVersion } from '../storage/termsConsentStore'
import { BOOT_FADE_MS, bootChrome, bootLogoHtml, nativeSplashBg, needsBootFade } from './bootTheme'
import { isWarmBoot, loadLastAuthedAt, saveLastAuthedAt } from '../storage/bootMetaStore'
import { useKillSwitch } from '../health/KillSwitchProvider'
import { useDemo } from '../demo/DemoProvider'
import { COLORS, useThemeVariant } from '../theme'

// checking中に本物のログイン状態が判定できない場合の保険（リダイレクト完了待ち）。
const CHECK_TIMEOUT_MS = 12000
// setup（時間割自動取り込み）が進まない場合は諦めて入場する（手動収集にフォールバック）。
const SETUP_TIMEOUT_MS = 25000
// setup中、ページ読込後に時間割テーブル抽出を試みるまでの待ち。
const SETUP_COLLECT_DELAY_MS = 900
// 初回フル同期（コース→スナップショット→課題）の上限。超えたら入場し裏で再試行に任せる。
const SYNC_TIMEOUT_MS = 180000
// 起動ローディングのイントロ(CLASS+LETUS→LITUS 合体)の長さ。これが終わるまで入場/スライドへ移さない。
// bootLogoHtml の dc.html 由来の S=4.0s（ループ開始＝イントロ完了）と一致させる。
const BOOT_INTRO_MS = 4000
// ループ(不定形バー)の1周期。dc.html の P=1.4s と一致。認証完了がループ中なら次の周期境界で入場する。
const BOOT_LOOP_MS = 1400
// CLASS定時メンテナンス中、明けを検知して自動復帰するための再probe間隔。
const MAINTENANCE_REPROBE_MS = 60000
// 接続エラー中、通信が戻ったら自動で入場/ログインへ進めるための静かな再probe間隔。
const CONN_ERROR_REPROBE_MS = 15000

type GateState =
  | 'loading'
  | 'needsConsent'
  | 'firstRun'
  | 'checking'
  | 'needsLogin'
  | 'setup'
  | 'sync'
  | 'authed'
  | 'maintenance'
  | 'connError'

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
  const webviewRef = useRef<WebViewInstance>(null)
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
  // リモートkill switch（コールバックから最新値を読むためのref）。all停止はProvider側で
  // ゲートされるため、ここでは letus 停止時に初回フル同期をスキップする用途のみ。
  const killSwitch = useKillSwitch()
  const killSwitchRef = useRef(killSwitch)
  killSwitchRef.current = killSwitch
  // デモ導線。enter でデモ名前空間へ切り替わり、App.tsx 側で本ゲートごとツリーから外れる。
  const { enter: enterDemo } = useDemo()
  // 初回フル同期の進捗表示。
  const [syncLabel, setSyncLabel] = useState('データを取り込んでいます…')
  // 起動アニメの見た目はテーマ由来の3値（green=翠グラデ／white=白／dark=夜の翠）。
  // 2値（bootWhite）で分岐していた頃はダークが翠版へ落ち、起動のたびに緑の閃光が出ていた。
  const { variant } = useThemeVariant()
  const chrome = bootChrome(variant)
  // ネイティブスプラッシュはOSのスキームにしか従えない（テーマ設定はAsyncStorage＝読めない）ため、
  // 「テーマ=ダーク・OS=ライト」等では起動画面と色が食い違い一瞬飛ぶ。スプラッシュが出していた色を
  // 上から被せ、BOOT_FADE_MS かけて消す＝飛びをクロスフェードに変える。色が一致していれば不要。
  // useColorScheme は 'unspecified' も返しうる。theme.tsx と同じ正規化で light/dark 以外は undefined に倒す。
  const rawScheme = useColorScheme()
  const scheme = rawScheme === 'dark' || rawScheme === 'light' ? rawScheme : undefined
  const fadeNeeded = needsBootFade(variant, scheme)
  const splashFade = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!fadeNeeded) return
    const a = Animated.timing(splashFade, {
      toValue: 0,
      duration: BOOT_FADE_MS,
      useNativeDriver: true,
    })
    a.start()
    return () => a.stop()
  }, [fadeNeeded, splashFade])
  // イントロ完走ゲート（これが立つまでスライド/接続状況テキストは出さない）。
  const [bootAnimDone, setBootAnimDone] = useState(false)
  // 入場可否ゲート: イントロ完走＋認証完了＋（ループ中に認証完了したなら次の周期境界）で true。
  const [bootReady, setBootReady] = useState(false)
  // イントロが完了した時刻（＝ループ開始時刻）。周期境界の計算に使う。
  const introDoneAtRef = useRef<number | null>(null)
  // authed に最初に到達した時刻。イントロ前に済んだか/ループ中に済んだかの判定に使う。
  const authedAtRef = useRef<number | null>(null)
  // 起動モード: 決定するまで（null）は起動ロゴをマウントせず下地色のみ表示する。
  // warm=その日2回目以降（セッション生存・同期不要）→ループのみ版。full=フルイントロ。
  const [bootMode, setBootMode] = useState<'full' | 'warm' | null>(null)

  useEffect(() => {
    if (bootMode == null) return
    const introMs = bootMode === 'warm' ? 0 : BOOT_INTRO_MS
    const t = setTimeout(() => {
      introDoneAtRef.current = Date.now()
      setBootAnimDone(true)
    }, introMs)
    return () => clearTimeout(t)
  }, [bootMode])

  // authed 到達時刻を記録（初回のみ）。
  useEffect(() => {
    if (state === 'authed' && authedAtRef.current == null) authedAtRef.current = Date.now()
  }, [state])

  // 入場タイミング（ユーザー要望）:
  //  ・認証がイントロ完了までに済んでいた → そのまま入場（ロードフェーズは見せない）
  //  ・認証がループ中に済んだ           → 走っている1周期が終わる次の境界まで待ってから入場
  useEffect(() => {
    if (bootReady) return
    if (!(state === 'authed' && bootAnimDone)) return
    const introAt = introDoneAtRef.current ?? Date.now()
    const authedAt = authedAtRef.current ?? Date.now()
    let delay = 0
    if (authedAt > introAt) {
      const elapsed = Date.now() - introAt
      delay = BOOT_LOOP_MS - (elapsed % BOOT_LOOP_MS)
    }
    const t = setTimeout(() => setBootReady(true), delay)
    return () => clearTimeout(t)
  }, [state, bootAnimDone, bootReady])

  useEffect(() => {
    ;(async () => {
      try {
        // 規約同意を最優先で判定（未同意/旧版なら規約 → オンボ → ログインの順）。
        const accepted = await loadAcceptedTermsVersion()
        if (accepted < TERMS_VERSION) {
          setBootMode('full')
          setState('needsConsent')
          return
        }
        const done = await loadOnboardingDone()
        if (!done) {
          wasFirstRunRef.current = true
          setBootMode('full')
          setState('firstRun')
          return
        }
        // 既存ユーザー: その日2回目以降＆同期不要なら warm。
        const [lastAuthedAt, ttAt] = await Promise.all([
          loadLastAuthedAt(),
          loadTimetableRefreshedAt(),
        ])
        setBootMode(isWarmBoot(lastAuthedAt, ttAt) ? 'warm' : 'full')
        setState('checking')
      } catch {
        setBootMode('full')
        setState('checking')
      }
    })()
  }, [])

  useEffect(() => {
    if (state !== 'checking') return
    // loading 中に probe のロードが既に完了していると onLoadEnd は再発火しない。checking 開始時に
    // 判定を再取得して、loading 中に来た authed/needsLogin の取りこぼし（→CHECK_TIMEOUTでconnError）を防ぐ。
    webviewRef.current?.injectJavaScript(DETECT_PAGE_JS)
    // 12秒で判定が出ない＝通信不良でページ読込が完了していない（onLoadEnd未発火→DETECT未実行）。
    // これは「要ログイン」ではなく通信起因なので、CLASSログイン画面ではなく接続エラー表示へ。
    const t = setTimeout(() => setState((s) => (s === 'checking' ? 'connError' : s)), CHECK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [state, nonce])

  // 可視ログイン（needsLogin＝ユーザー操作中）に入ったら復帰カウンタを0に戻す。
  // 起動probeの通信失敗回数を対話ログインへ持ち越して、本物のログインを早まって connError に
  // 逸らさないため（レビュー指摘）。
  useEffect(() => {
    if (state === 'needsLogin') recoverTriesRef.current = 0
  }, [state])

  // connError: 通信が戻ったら自動で復帰できるよう、静かに再probeする（メンテと同型）。
  // recoverTries をリセットして nonce を上げ、probe WebView を作り直す（状態は connError のまま）。
  useEffect(() => {
    if (state !== 'connError') return
    const t = setInterval(() => {
      recoverTriesRef.current = 0
      setNonce((n) => n + 1)
    }, CONN_ERROR_REPROBE_MS)
    return () => clearInterval(t)
  }, [state])

  // maintenance: 定時メンテ（〜4:00）が明けたら自動で復帰できるよう、一定間隔で再probeする。
  useEffect(() => {
    if (state !== 'maintenance') return
    const t = setInterval(() => {
      setNonce((n) => n + 1)
      setState((s) => (s === 'maintenance' ? 'checking' : s))
    }, MAINTENANCE_REPROBE_MS)
    return () => clearInterval(t)
  }, [state])

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
    setBootMode('warm')
    setNonce((n) => n + 1)
    setState('checking')
  }

  /**
   * WebViewの自動復帰: nonce を上げて作り直す（probe URLもキャッシュバスターが変わる）。
   * ロード失敗（chrome-error）・レンダラクラッシュ・SAML「過去のリクエスト」・LETUS迷子で使う。
   * 上限を超えたら needsLogin（可視WebView＋再読み込みボタン）に落として手動復帰へ。
   */
  function recover() {
    const plan = recoverPlan(stateRef.current, recoverTriesRef.current)
    // needsLogin（入力中）と connError（再probeは専用intervalが駆動）は触らない。
    if (plan === 'noop') return
    if (plan === 'toConnError') {
      // 通信起因の失敗が続いた＝ログイン切れではない。CLASSログイン画面ではなく接続エラー表示へ。
      // ただし規約同意/初回/loading の画面は壊さない（consent画面を消すと規約バイパスに繋がる）。
      setState((s) => (isRecoverPreserved(s) ? s : 'connError'))
      return
    }
    recoverTriesRef.current += 1
    setNonce((n) => n + 1)
    setState((s) => (isRecoverPreserved(s) ? s : 'checking'))
  }

  /** setup（時間割）完了後の遷移先。初回はフル同期（コース→課題）も可視で済ませる。 */
  function afterSetup(): GateState {
    if (killSwitchRef.current.isKilled('letus')) return 'authed'
    return wasFirstRunRef.current && !syncSession.didFullSync ? 'sync' : 'authed'
  }

  /**
   * メンテナンス中に「このまま開く」で入場する（既存ユーザー向け）。CLASSの setup/sync は
   * 走らせず、キャッシュ済みの時間割・課題・インフォを閲覧できる状態でタブへ入る。
   * 出席や時間割更新はCLASS復帰後に各画面で再試行される。
   */
  function enterDegraded() {
    setState('authed')
  }

  /**
   * ログイン確認後の入場処理。時間割が未保存、または前回更新から時間が経っていれば setup
   * （CLASS画面を見せない裏取得）を挟む。ここはタブ・出席WebViewが未マウントの段階なので
   * CLASSの競合が起きない＝時間割の自動更新に最適なタイミング。
   */
  function proceedToEntry() {
    // ログイン確認成功＝次回のwarm判定用に時刻を残す（fire-and-forget）。
    saveLastAuthedAt().catch(() => undefined)
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
        hasLogout: !!p.hasLogout,
        hasSsoStale: !!p.hasSsoStale,
        hasMaintenance: !!p.hasMaintenance,
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
      if (verdict === 'maintenance') {
        // CLASS定時メンテナンス（2:00〜4:00）。ログインもできないので専用画面へ（詰まらせない）。
        if (s === 'checking' || s === 'needsLogin' || s === 'connError') setState('maintenance')
        return
      }
      // connError（接続エラー保留）中でも、probeが確定判定を出したらそれに従う:
      // authed→入場 / needsLogin→本物のログイン画面へ昇格。checkingと同じ扱い。
      if (s === 'checking' || s === 'connError') {
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

  // 認証が早く終わってもイントロ完走まで、ループ中に終わったなら周期の切れ目まで待ってから入場。
  if (state === 'authed' && bootReady) {
    return <LoginContext.Provider value={{ requireLogin }}>{children}</LoginContext.Provider>
  }

  // デモ導線。**needsLogin 以外でも出す。** 審査員は多くの場合海外から開くため、
  // CLASS に到達できないと connError に落ちる。そこでデモが見えないと「再読み込み」しか
  // 選択肢がない行き止まりになり（enterDegraded は初回起動では出ない）、2.1 で即リジェクトになる。
  const demoEntry = (onCard: boolean) => (
    <Pressable
      style={onCard ? styles.demoBtnCard : styles.demoBtn}
      onPress={() => void enterDemo()}
      accessibilityRole="button"
    >
      <Text style={onCard ? styles.demoBtnCardText : styles.demoBtnText}>
        ログインせずにデモを見る
      </Text>
    </Pressable>
  )
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
            {demoEntry(false)}
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
              syncSession.lastFullSyncAt = Date.now()
              setState((s) => (s === 'sync' ? 'authed' : s))
            }}
          />
        ) : null}
        {state !== 'connError' && (!bootAnimDone || state === 'loading' || state === 'checking' || state === 'setup' || state === 'sync' || (state === 'authed' && !bootReady)) ? (
          <View style={[styles.boot, { backgroundColor: chrome.bg }]}>
            {/* 起動ロゴアニメ（純CSS・ローカルHTML）。bootMode 決定前（null）はマウントせず下地色のみ。
                warm はループのみ版で即ループへ。以降も裏でログイン/取得が進む間は表示。タッチは奪わない。 */}
            {bootMode != null ? (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <WebView
                  source={{ html: bootLogoHtml(variant, bootMode) }}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                  overScrollMode="never"
                  // 各版が自前で描く地色に合わせる（読込中の一瞬の下地を一致させる）。
                  style={{ backgroundColor: chrome.bg }}
                />
              </View>
            ) : null}
            {/* フラッシュ抑制: ネイティブスプラッシュが出していた色を被せ、BOOT_FADE_MS で消す。
                スプラッシュはOSスキーム固定なのでテーマと食い違うことがあり（例: テーマ=ダーク/OS=ライト）、
                そのままだと白→暗が瞬間的に飛ぶ。色が一致していれば被せない（fadeNeeded=false）。
                ロゴWebViewより後＝上に置き、タッチは奪わない。 */}
            {fadeNeeded ? (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: nativeSplashBg(scheme), opacity: splashFade },
                ]}
                pointerEvents="none"
              />
            ) : null}
            {/* 接続状況（アニメ完了後も長い待ちで固まって見えないよう）。背景色に応じて可読色に。
                アニメ再生中（!bootAnimDone かつ通常フロー）は邪魔しないよう出さない。 */}
            {bootAnimDone ? (
              <View style={styles.bootStatusWrap} pointerEvents="none">
                <Text style={[styles.bootStatusText, { color: chrome.statusColor }]}>
                  {bootStatus}
                  {state === 'sync' ? '（初回のみ・少し時間がかかります）' : ''}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {state === 'needsConsent' && bootAnimDone ? (
          <View style={StyleSheet.absoluteFill}>
            <TermsConsentScreen
              onAccept={async () => {
                try {
                  const done = await loadOnboardingDone()
                  if (!done) wasFirstRunRef.current = true
                  setState(done ? 'checking' : 'firstRun')
                } catch {
                  setState('checking')
                }
              }}
            />
          </View>
        ) : null}
        {state === 'firstRun' && bootAnimDone ? (
          <View style={StyleSheet.absoluteFill}>
            <OnboardingSlides onDone={onSlidesDone} />
          </View>
        ) : null}
        {state === 'maintenance' ? (
          <View style={[styles.maintFill, { paddingTop: insets.top }]}>
            <View style={styles.maintCard}>
              <Text style={styles.maintTitle}>CLASSメンテナンス中</Text>
              <Text style={styles.maintBody}>
                CLASSは毎日 午前2:00〜4:00 がシステムメンテナンスのため利用できません。
                時間をおいて再度お試しください。
              </Text>
              <Pressable
                style={styles.maintPrimary}
                onPress={() => {
                  recoverTriesRef.current = 0
                  requireLogin()
                }}
              >
                <Text style={styles.maintPrimaryText}>再読み込み</Text>
              </Pressable>
              {!wasFirstRunRef.current ? (
                <>
                  <Pressable style={styles.maintGhost} onPress={enterDegraded}>
                    <Text style={styles.maintGhostText}>このまま開く（時間割・課題は閲覧できます）</Text>
                  </Pressable>
                  <Text style={styles.maintNote}>※出席の受付確認と時間割の更新はCLASS復帰後に使えます。</Text>
                </>
              ) : null}
              {demoEntry(true)}
            </View>
          </View>
        ) : null}
        {state === 'connError' ? (
          <View style={[styles.maintFill, { paddingTop: insets.top }]}>
            <View style={styles.maintCard}>
              <Text style={styles.maintTitle}>接続できませんでした</Text>
              <Text style={styles.maintBody}>
                通信状況を確認して、もう一度お試しください。電波の良い場所では自動的に再接続します。
              </Text>
              <Pressable
                style={styles.maintPrimary}
                onPress={() => {
                  recoverTriesRef.current = 0
                  requireLogin()
                }}
              >
                <Text style={styles.maintPrimaryText}>再読み込み</Text>
              </Pressable>
              {!wasFirstRunRef.current ? (
                <>
                  <Pressable style={styles.maintGhost} onPress={enterDegraded}>
                    <Text style={styles.maintGhostText}>このまま開く（時間割・課題は閲覧できます）</Text>
                  </Pressable>
                  <Text style={styles.maintNote}>※出席の受付確認と時間割の更新は接続の回復後に使えます。</Text>
                </>
              ) : null}
              {demoEntry(true)}
            </View>
          </View>
        ) : null}
      </View>
    </LoginContext.Provider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  maintFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.gradBottom,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  maintCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 12,
  },
  maintTitle: { color: COLORS.emeraldDark, fontSize: 18, fontWeight: '700' },
  maintBody: { color: '#3a4b45', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  maintPrimary: {
    marginTop: 4,
    backgroundColor: COLORS.cta,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  maintPrimaryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  maintGhost: {
    backgroundColor: '#eef5f2',
    borderWidth: 1,
    borderColor: '#b9ddcd',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
  },
  maintGhostText: { color: COLORS.emeraldDark, fontSize: 13, fontWeight: '600' },
  maintNote: { color: '#7c8b85', fontSize: 11, textAlign: 'center' },
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
  demoBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  demoBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  // メンテ/接続エラーの白カード内で使う版（翠ヘッダー用の白文字だと見えないため）。
  demoBtnCard: {
    backgroundColor: '#eef5f2',
    borderWidth: 1,
    borderColor: '#b9ddcd',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
  },
  demoBtnCardText: { color: COLORS.emeraldDark, fontSize: 13, fontWeight: '600' },
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
