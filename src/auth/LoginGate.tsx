import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, AppState, Pressable, StyleSheet, useColorScheme, View } from 'react-native'
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
import { pickCurrentSemester } from '../collect/semester'
import { loadTimetable, saveTimetable } from '../storage/timetableStore'
import {
  isTimetableStale,
  loadTimetableRefreshedAt,
  saveTimetableRefreshedAt,
} from '../storage/refreshMetaStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { getNotificationPermission, requestNotificationPermission } from '../notifications/notifier'
import { notificationPermissionAction } from '../notifications/permissionState'
import { loadOnboardingDone, saveOnboardingDone } from '../storage/onboardingStore'
import { canDeferLoginUi, classifyGatePage, isSpeculativeLogin, type GateVerdict } from './classifyGatePage'
import { isRecoverPreserved, recoverPlan } from './gateRecovery'
import { shouldMountGateProbe } from './gateProbeMount'
import {
  createConnErrorReprobe,
  isForegroundAppState,
  maintenanceReprobeDelayMs,
  type ReprobeEvent,
} from './gateReprobe'
import { syncSession } from '../collect/syncSession'
import LetusSyncEngine from '../collect/LetusSyncEngine'
import OnboardingSlides from '../screens/OnboardingSlides'
import TermsConsentScreen from '../screens/TermsConsentScreen'
import { TERMS_VERSION } from '../legal/termsVersion'
import { loadAcceptedTermsVersion } from '../storage/termsConsentStore'
import { BOOT_FADE_MS, bootChrome, bootLogoHtml, nativeSplashBg, needsBootFade } from './bootTheme'
import { bootStatusBottom } from '../screens/bootFooterGeometry'
import { isWarmBoot, loadLastAuthedAt, saveLastAuthedAt } from '../storage/bootMetaStore'
import { useKillSwitch } from '../health/KillSwitchProvider'
import { isOnlineNow, subscribeConnectivity } from '../health/connectivity'
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
/**
 * **推測的な** needsLogin でログインUIの描画を待つ猶予（ms）。
 *
 * 強制終了→起動では大学のセッションCookie（Expires無し）が消えているので、probe は必ず SSO を
 * 経由する。IdP側のCookieが生きていればこの経由は操作なしで自動完走するが、classifyGatePage は
 * 「SSOのURLに居る」だけで needsLogin を返す（初画面にパスワード欄が無いためURL判定が要る）。
 * その結果、完走までの数百msだけログイン画面が描かれる＝「一瞬映る」の正体。
 * 状態機械は触らず、**描画だけ**をこの猶予ぶん遅らせる（認証フローの挙動は不変）。
 *
 * 値の天秤:
 * - 短すぎる → 自動完走に間に合わず、一瞬の描画が残る（元の不具合が消えない）。
 * - 長すぎる → 本当にログインが要る時に「固まった」ように見える。
 * 1500ms は SAML自動完走（フォーム描画→自動POST→リダイレクト往復）を覆いつつ、待たされる側の
 * 体感がブート画面の範囲に収まる初期値。猶予中はブート画面（"CLASSに接続しています…"）のままなので
 * 進行中に見え、無反応には見えない。
 *
 * ⚠この猶予が効くのは **推測ケースだけ**（isSpeculativeLogin）。パスワード欄が実在する確定ケースは
 * 猶予せず即描画し、猶予中にパスワード欄が現れたらその場で打ち切る＝「固まる」側の最悪ケースを
 * 構造的に小さくしてある。実機で詰める前提の初期値。
 */
const SSO_AUTO_GRACE_MS = 1500

/**
 * 自動 probe（接続エラー・メンテの再確認）の開発ログ。__DEV__ のときだけ出す。
 * 実機確認（設計 G1 §8）は wait／probe／stop の3種で判定する。stop の行も省かない
 * （背面で probe が出ないだけなら変更前も同じになる＝止めたことは stop の行でしか見えない）。
 */
function reprobeDevLog(event: ReprobeEvent, ms: number) {
  if (!__DEV__) return
  console.log(event === 'wait' ? `[litus/gate] reprobe wait=${ms}ms` : `[litus/gate] reprobe ${event}`)
}

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
 *
 * 規約の同意が確定するまで（loading / needsConsent）は probe をマウントしない（shouldMountGateProbe）。
 * 同意の前は CLASS にも大学のログイン基盤にも1回も出ない＝掲載文「利用規約に同意いただくまで、
 * LETUSとCLASSからの情報の取得は始まりません」の実装（設計: docs/design/2026-09-12-v11-train1-PC.md）。
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
  // 直近の needsLogin が推測（SSOのURLに居るだけ）だったか。true の間だけ描画を猶予する。
  const speculativeLoginRef = useRef(false)
  // ログインUIを実際に描いてよいか（needsLogin へ入っても猶予が明けるまで false）。
  const [loginUiArmed, setLoginUiArmed] = useState(false)
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
        // ここに来るのは規約の同意を確かめた後（オンボ・warm 判定の読み取りの失敗）だけ。
        // 規約の読み取りは失敗しても投げずに 0（未同意）を返す（termsConsentStore・設計 PC）。
        setBootMode('full')
        setState('checking')
      }
    })()
  }, [])

  useEffect(() => {
    if (state !== 'checking') return
    // firstRun（スライドの裏）で probe のロードが既に完了していると onLoadEnd は再発火しない。checking 開始時に
    // 判定を再取得して、スライド中に来た判定の取りこぼし（→CHECK_TIMEOUTでconnError）を防ぐ。
    // loading 中は probe をマウントしない（設計 PC）ので、以前の「loading 中に来た判定」はもう起きない。
    // probe を作った直後（同意の直後・nonce+1 の直後）は空振りするが、判定は pending で捨てられ onLoadEnd が撃ち直す。
    webviewRef.current?.injectJavaScript(DETECT_PAGE_JS)
    // 12秒で判定が出ない＝通信不良でページ読込が完了していない（onLoadEnd未発火→DETECT未実行）。
    // これは「要ログイン」ではなく通信起因なので、CLASSログイン画面ではなく接続エラー表示へ。
    const t = setTimeout(() => setState((s) => (s === 'checking' ? 'connError' : s)), CHECK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [state, nonce])

  // ログインUIの描画解禁タイマー（SSO_AUTO_GRACE_MS 参照）。needsLogin を離れたら必ず武装解除する
  // ＝次に needsLogin へ入ったときは、また猶予から始まる（前回の解禁を持ち越さない）。
  useEffect(() => {
    if (state !== 'needsLogin') {
      setLoginUiArmed(false)
      return
    }
    // 確定（パスワード欄が実在）＝待つ理由が無いので即描画。
    if (!speculativeLoginRef.current) {
      setLoginUiArmed(true)
      return
    }
    const t = setTimeout(() => setLoginUiArmed(true), SSO_AUTO_GRACE_MS)
    return () => clearTimeout(t)
  }, [state])

  // 可視ログイン（needsLogin＝ユーザー操作中）に入ったら復帰カウンタを0に戻す。
  // 起動probeの通信失敗回数を対話ログインへ持ち越して、本物のログインを早まって connError に
  // 逸らさないため（レビュー指摘）。
  useEffect(() => {
    if (state === 'needsLogin') recoverTriesRef.current = 0
  }, [state])

  // connError: 通信が戻ったら自動で復帰できるよう、静かに再probeする（状態は connError のまま）。
  // recoverTries をリセットして nonce を上げ、probe WebView を作り直す。いつ撃つかは予定表
  // （gateReprobe.ts）が決める＝15秒から倍々で上限5分・ジッタつき、probe 同士は必ず15秒以上空く。
  // 回線の復帰（offline→online）と前面への復帰でやり直し、背面（'background'）では待ちを消す
  // （'inactive' では止めない）。deps は [state] だけ＝nonce を入れると probe のたびに連鎖が頭へ戻る。
  // AppState と回線の購読はこの effect の中でだけ張る（LoginGate に state を足すと、authed 中も
  // LoginContext の消費者まで再描画が波及する）。
  useEffect(() => {
    if (state !== 'connError') return
    const r = createConnErrorReprobe(
      () => {
        recoverTriesRef.current = 0
        setNonce((n) => n + 1)
      },
      { onEvent: reprobeDevLog },
    )
    if (isForegroundAppState(AppState.currentState)) r.start('enter')
    const app = AppState.addEventListener('change', (s) => {
      if (!isForegroundAppState(s)) r.stop()
      else if (!r.isRunning()) r.start('resume') // 待ち中の重複イベントでは回数を戻さない
    })
    let wasOnline = isOnlineNow()
    const unsubNet = subscribeConnectivity(() => {
      const on = isOnlineNow()
      // offline→online の時だけ。背面中（待ちが無い）は前面への復帰に任せる。
      if (!wasOnline && on && r.isRunning()) r.start('resume')
      wasOnline = on
    })
    return () => {
      r.stop()
      app.remove()
      unsubNet()
    }
  }, [state])

  // maintenance: 定時メンテ（2:00〜4:00）が明けたら自動で復帰できるよう、再probeする。
  // 端末時刻が帯の中なら明け（4:00＋0〜60秒のぶれ）に1回だけ、帯の外（臨時メンテ・明けの遅れ）は
  // メンテに入った時刻から60秒後（変更前と同じ）。撃つ時は必ず nonce+1 と maintenance→checking を
  // セットで行う（maintenance 状態には authed を受ける分岐が無い＝nonce だけ上げると明けても固まる）。
  // 背面（'background'）では待ちを消し、前面で計算し直す（'inactive' では止めない）。回線の購読は張らない。
  useEffect(() => {
    if (state !== 'maintenance') return
    const enteredAt = Date.now()
    let t: ReturnType<typeof setTimeout> | null = null
    const arm = () => {
      const ms = maintenanceReprobeDelayMs(new Date(), enteredAt, Math.random())
      reprobeDevLog('wait', ms)
      t = setTimeout(() => {
        t = null
        reprobeDevLog('probe', 0)
        setNonce((n) => n + 1)
        setState((s) => (s === 'maintenance' ? 'checking' : s))
      }, ms)
    }
    const disarm = () => {
      if (t == null) return
      clearTimeout(t)
      t = null
      reprobeDevLog('stop', 0)
    }
    if (isForegroundAppState(AppState.currentState)) arm()
    const app = AppState.addEventListener('change', (s) => {
      if (!isForegroundAppState(s)) disarm()
      else if (t == null) arm()
    })
    return () => {
      disarm()
      app.remove()
    }
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
    // 規約の同意が確定する前は何もしない。checking へ移すと規約画面を飛ばして probe が立つ（設計 PC）。
    // 今は同意前に呼ぶ経路が無い（呼び出し元は同意後の画面と入場後の children だけ）＝将来の迂回を塞ぐ二重の防御。
    if (!shouldMountGateProbe(stateRef.current)) return
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
    // needsLogin（入力中）と connError（再probeは予定表 gateReprobe.ts の createConnErrorReprobe が駆動）は触らない。
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
    // 通知権限はここで初めて要求する。スライド3枚目が「授業前に出席ナッジが届きます」と
    // 価値を説明済みで、規約同意も終わっている＝事前説明のある1回になる。
    // 起動直後（App.tsx のブート effect）で要求していた頃は、規約同意画面やスライド1枚目の
    // 上にOSダイアログが被さっていた。Android は2回拒否されると以後ダイアログを出せず、
    // インストールし直すまで回復できないため、この1回は無駄にできない。
    // スキップ操作でも onSlidesDone は通るので取りこぼさない。デモモードは LoginGate 自体が
    // ツリーから外れるためここに到達しない（＝デモ体験からは要求しない）。
    //
    // **既存ユーザー（onboardingDone=true）はここを通らない**が、それで良い。理由:
    // 旧実装は毎起動で無条件に要求しており、既存ユーザーは全員すでに1回は聞かれている
    // （granted / 1回拒否 / 2回拒否=恒久 のいずれか）。1回拒否の人に毎起動ダイアログを出すのは
    // 説明のないまま「残り1回」を消費させる行為で、まさにこの修正が止めたかったこと。
    // 代わりに全員へ回復導線が届く: 設定＞通知の先頭は無条件に NotificationPermissionNotice を出し、
    // ホームにも同じ純関数の判定でバナーを出す。CTA は 1回拒否なら再要求、恒久拒否なら端末設定へ飛ぶ。
    // つまり「勝手にダイアログ」から「説明つきで本人が選ぶ」へ移しただけで、救える範囲は狭まっていない。
    ;(async () => {
      try {
        const current = await getNotificationPermission()
        if (notificationPermissionAction(current) === 'request') await requestNotificationPermission()
      } catch {
        // 権限要求の失敗で入場を止めない（設定画面の回復導線から復帰できる）。
      }
    })()
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
      const signal = {
        hasPasswordInput: !!p.hasPasswordInput,
        hasClassMenu: !!p.hasClassMenu,
        hasEnterSplash: !!p.hasEnterSplash,
        hasLogout: !!p.hasLogout,
        hasSsoStale: !!p.hasSsoStale,
        hasMaintenance: !!p.hasMaintenance,
        url: typeof p.url === 'string' ? p.url : undefined,
      }
      const verdict = classifyGatePage(signal)
      if (verdict === 'pending') return // リダイレクト途中は待つ
      if (verdict === 'stale' || verdict === 'stray') {
        // SAMLリプレイ拒否 or SSO混線でLETUS着地 → WebViewを作り直して新しいSAMLフローで再試行。
        recover()
        return
      }
      lastResultRef.current = verdict
      if (verdict === 'authed') recoverTriesRef.current = 0
      const s = stateRef.current
      // 猶予してよいかを **lastResultRef と同じ場所で必ず更新する**: needsLogin へ入る経路は
      // onMessage だけでなく onSlidesDone（firstRun 完走時に lastResultRef を見て直接 setState する）
      // もあり、片方だけで書くと古い値を読む面ができる。判定の出所を1箇所に固定しておく。
      // 遷移元 s を渡すのは、ブート画面が外れている状態（firstRun / connError）から猶予に入ると
      // オーバーレイごと再マウントして起動イントロを巻き戻すため（canDeferLoginUi の根拠参照）。
      if (verdict === 'needsLogin') speculativeLoginRef.current = canDeferLoginUi(signal, s)
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
      } else if (s === 'needsLogin') {
        if (verdict === 'authed') {
          // 可視ログイン完了、または猶予中に自動完走した＝一度も描かずに入場する。
          proceedToEntry()
        } else if (verdict === 'needsLogin' && !isSpeculativeLogin(signal)) {
          // 猶予中にパスワード欄が現れた＝もう推測ではない（ref は上で false に更新済み）。
          // 待たずに打ち切って描く＝猶予が「固まって見える」側へ倒れる最悪ケースを短くする。
          // ここで明示的に解禁するのは、猶予タイマーの effect が state 変化でしか再実行されないため。
          setLoginUiArmed(true)
        }
      }
      return
    }
    if (p.type === 'timetable' && stateRef.current === 'setup') {
      const result = parseCollectionMessage(data)
      if (__DEV__) {
        // 開発時のみ。LoginGate は起動時の本流なので、こちらにも同じ計測を置く。
        const d = p as Record<string, unknown>
        console.log(
          '[litus/gate] page=%s gstate=%s gakki=%s tables=%s heads=%s → 保存=%d件',
          String(d.page), String(d.gstate), JSON.stringify(d.gakki),
          Array.isArray(d.tables) ? String(d.tables.length) : '?',
          JSON.stringify(d.heads),
          result.collections.length,
        )
      }
      if (!result.error && result.collections.length > 0) {
        ;(async () => {
          try {
            // 2枚返る場合は当該学期だけ保存する（semester.ts の頭）
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
  // needsLogin でも、推測段階（SSO自動完走待ち）の間は描かない＝「一瞬映る」を消す。
  const showLoginUi = state === 'needsLogin' && loginUiArmed
  // 猶予中。ここを掴んでおかないとブート画面が外れて空白になる（描画を止めただけでは足りない）。
  const inLoginGrace = state === 'needsLogin' && !loginUiArmed
  // 規約の同意が確定するまで probe を作らない（判定は gateProbeMount.ts・設計 PC）。
  const probeMounted = shouldMountGateProbe(state)
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
          {/* 🔴 同意の確定前（loading / needsConsent）は WebView そのものを作らない。隠す・source を差し替える・
              onShouldStartLoadWithRequest で止める、では同意前の通信を止めきれない（設計 PC の禁止事項1）。 */}
          {probeMounted ? (
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
              // 開発時のみ: probe が読み込みを始めた時点の状態と行き先（検証の計器・設計 PC §8）。クエリは出さない。
              // 1つの文字列で渡す（RN の console は logcat／os_log へ出す時に %s を置き換えない）。
              onLoadStart={
                __DEV__
                  ? (e) =>
                      console.log(
                        `[litus/gate] probe loadStart state=${stateRef.current} origin=${e.nativeEvent.url.replace(/^([a-z][a-z0-9+.-]*:\/\/[^/?#]*).*$/i, '$1')}`,
                      )
                  : undefined
              }
              onLoadEnd={onLoadEnd}
              onMessage={(e) => onMessage(e.nativeEvent.data)}
              onError={() => recover()}
              onHttpError={(e) => {
                if (e.nativeEvent.statusCode >= 500) recover()
              }}
              onRenderProcessGone={() => recover()}
              style={styles.webviewFill}
            />
          ) : null}
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
        {state !== 'connError' && (!bootAnimDone || state === 'loading' || state === 'checking' || inLoginGrace || state === 'setup' || state === 'sync' || (state === 'authed' && !bootReady)) ? (
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
              <View style={[styles.bootStatusWrap, { bottom: bootStatusBottom(insets.bottom) }]} pointerEvents="none">
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
  root: { flex: 1, backgroundColor: '#ffffff' }, // design-allow 未トークン化（既存）
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
    backgroundColor: '#ffffff', // design-allow 未トークン化（既存）
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 12,
  },
  maintTitle: { color: COLORS.emeraldDark, fontSize: 18, fontWeight: '700' },
  maintBody: { color: '#3a4b45', fontSize: 14, lineHeight: 21, textAlign: 'center' }, // design-allow 未トークン化（既存）
  maintPrimary: {
    marginTop: 4,
    backgroundColor: COLORS.cta,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  maintPrimaryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' }, // design-allow 未トークン化（既存）
  maintGhost: {
    backgroundColor: '#eef5f2', // design-allow 未トークン化（既存）
    borderWidth: 1,
    borderColor: '#b9ddcd', // design-allow 未トークン化（既存）
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
  },
  maintGhostText: { color: COLORS.emeraldDark, fontSize: 13, fontWeight: '600' },
  maintNote: { color: '#7c8b85', fontSize: 11, textAlign: 'center' }, // design-allow 未トークン化（既存）
  header: { backgroundColor: COLORS.emerald, paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '600' }, // design-allow 未トークン化（既存）
  sub: { color: '#eafff7', fontSize: 13, marginTop: 4 }, // design-allow 未トークン化（既存）
  reloadBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)', // design-allow 未トークン化（既存）
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reloadBtnText: { color: '#ffffff', fontSize: 13 }, // design-allow 未トークン化（既存）
  demoBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)', // design-allow 未トークン化（既存）
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  demoBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' }, // design-allow 未トークン化（既存）
  // メンテ/接続エラーの白カード内で使う版（翠ヘッダー用の白文字だと見えないため）。
  demoBtnCard: {
    backgroundColor: '#eef5f2', // design-allow 未トークン化（既存）
    borderWidth: 1,
    borderColor: '#b9ddcd', // design-allow 未トークン化（既存）
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
  // 起動ロゴの © フッターに被らない位置は bootFooterGeometry の bootStatusBottom() が決める。
  // ⚠ここに固定値を書き戻さないこと。フッターは env(safe-area-inset-bottom) の分だけせり上がるので、
  // 固定値は「Androidでは正しく iOS だけ重なる」形にしかならない（実際に重なった）。
  bootStatusWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  bootStatusText: { fontSize: 12, letterSpacing: 0.04 * 12 },
})
