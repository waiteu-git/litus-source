import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { WebView, type WebViewInstance } from '../ui/GuardedWebView'
import { useLoginGate } from '../auth/LoginGate'
import { useKillSwitch } from '../health/KillSwitchProvider'
import { useClassView } from '../collect/classViewArbiter'
import { evaluateAccess } from '../health/accessGate'
import { useConnectivity } from '../health/connectivity'
import { useDemo } from '../demo/DemoProvider'
import { demoOverrides, demoWindow, DEMO_ATTENDANCE_COURSE } from './demoAttendance'
import {
  CLASS_PC_LOGIN_URL,
  DESKTOP_UA,
  DETECT_ATTENDANCE_JS,
  DETECT_PAGE_JS,
  ENTER_CLASS_PC_JS,
  OPEN_ATTENDANCE_JS,
  OPEN_REACTION_FORM_JS,
} from '../collect/injectedScripts'
import { buildSubmitAttendanceJs } from '../collect/attendanceSubmit.private'
import { buildSubmitReactionJs } from '../collect/reactionSubmit.private'
import { parseAttendanceMessage, type AttendanceReception, type AttendanceStatus } from '../collect/attendanceMessage'
import { parseReactionMessage } from '../collect/reactionMessage'
import { canSubmitReaction, REACTION_FILL_MAX_TRIES, REACTION_FILL_RETRY_MS } from './reactionPaper'
import { toReactionDiag, type ReactionOutcome } from './reactionDiag'
import { clearReactionDraft } from '../storage/reactionDraftStore'
import { classifyClassPage } from './classifyClassPage'
import { isInClassPeriod, attendedClassEndMin } from './classPeriod'
import { canRecordAttendance, isAttendedNow, resolveAttendedNow, mergeAttendedRecord, todayKey, type AttendedRecord } from './attendedState'
import { shouldAutoRetrySubmit, toSubmitDiag } from './submitDiag'
import { addSubmitDiag } from '../storage/submitDiagStore'
import { loadAttendedRecord, saveAttendedRecord } from '../storage/attendanceDoneStore'
import { parseWindowMinutes, type ReceptionWindowRecord } from './receptionWindow'
import { saveReceptionWindow, loadReceptionWindow } from '../storage/receptionWindowStore'
import {
  attendanceOpenKey,
  shouldNotifyAttendanceOpen,
  buildAttendanceOpenContent,
  courseCodeByName,
  pruneNotifiedAttendanceKeys,
} from '../notifications/attendanceOpenNotify'
import { loadAttendanceSettings } from '../storage/attendanceSettingsStore'
import type { AttendanceAlarmSettings } from '../notifications/attendanceSchedule'
import {
  loadNotifiedAttendanceOpen,
  mutateNotifiedAttendanceOpen,
} from '../storage/notifiedAttendanceOpenStore'
import {
  presentAttendanceOpenNotification,
  clearDeliveredAttendanceOpenNotifications,
  clearDeliveredAttendanceStartNotifications,
} from '../notifications/notifier'
import { notifyWidgetDataChanged } from '../widget/updateWidget'
import { normalizeAttendanceCode } from './normalizeCode'
import { loadTimetable } from '../storage/timetableStore'
import type { TimetableCollection } from '../collect/timetableMessage'
import {
  attendanceReducer,
  initialEngineState,
  type EnginePhase,
  type SubmitResult,
} from './engine'
import {
  CONFLICT_MIN_GAP_MS,
  conflictDelayMs,
  isConflictExhausted,
} from './conflictBackoff'
import { subscribeForeground } from '../app/foregroundOrchestrator'

const CLASS_URL = CLASS_PC_LOGIN_URL
// 出席状況の取得（メニュー遷移→受付判定）のタイムアウト。初回起動はSSOチェーンで時間がかかり、
// 従来の7秒・非リトライだと正常でも単発で navFailed（「受付状況を取得できませんでした」）に落ちていた。
// タイムアウトを緩め、さらに NAV_TIMEOUT_RETRIES 回だけ作り直して再試行してから navFailed にする。
const NAV_TIMEOUT_MS = 10000
// navTimeout 時に navFailed へ落とす前にWebViewを作り直して再試行する回数（errorPage の自動復帰と同型）。
const NAV_TIMEOUT_RETRIES = 1
const ATTENDANCE_POLL_MS = 30000

/**
 * 出席エンジン（CLASS WebView＋受付判定）をアプリ根で常時保持する共有層。
 *
 * 設計: docs/superpowers/specs/2026-07-09-home-tab-attendance-banner-design.md
 * - WebViewはタブ/画面遷移で破棄されない（ここが唯一の所有者）。出席画面(AttendanceScreen)は
 *   このcontextを読むだけの薄いUIになる。
 * - 起動ポリシー: 授業時間帯(isInClassPeriod) または 出席画面がフォーカス中 のあいだだけ
 *   WebViewを起動する（電池・CLASSセッション負荷回避）。停止中も reception はキャッシュ保持。
 * - 収集(時間割/掲示)がCLASSを使う間は WebView を譲る（classViewArbiter）。
 */
/** アプリ内リアペ提出の進行状態。sending中は入力・再提出を閉じ、failedは本文保持のまま案内を出す。 */
export type ReactionSubmitState = { status: 'idle' | 'sending' | 'failed'; message: string | null }

export type AttendanceEngineValue = {
  phase: EnginePhase
  reception: AttendanceReception | null
  result: SubmitResult | null
  attended: AttendedRecord | null
  attendedNow: boolean
  code: string
  setCode: (s: string) => void
  submit: () => void
  retry: () => void
  /** 出席ページを取り直して受付状態（学内/学外判定含む）を再抽出する。学外警告の「再確認」用。
      WebView再作成の retry() より軽量（メニューから出席ページを再オープン→再検出）。 */
  refreshAttendance: () => void
  /** アプリ内リアペ提出（reaction_pending時のみ有効）。②フォームへの流し込み→提出→出席確定まで進める。 */
  reactionSubmit: ReactionSubmitState
  submitReaction: (text: string) => void
  /** WebViewが起動中か（バナー判定で reception を信頼してよいかの目安）。 */
  running: boolean
  /**
   * 今日これまでに見た出席受付時間（"10:20〜12:00"）。**エンジン停止中でも有効**。
   * reception と違い静的な時刻レンジなので陳腐化せず、ホームが大学へ追加アクセスせずに
   * 「受付があと何分か」を出すのに使う（読み手は homeRemaining で今のコマにアンカーして採否を決める）。
   */
  receptionWindow: ReceptionWindowRecord | null
  /** PC等の他画面でCLASSを開いていて確認できない状態（複数画面競合）。UIは専用表示にする。 */
  conflict: boolean
  /** 競合が解けず自動再試行を打ち切った状態。UIは手動での再確認を促す。 */
  conflictExhausted: boolean
  failCount: number
  /** 直近の送信時刻（epoch ms・未送信は null）。確認窓の経過判定に使う（[[submitOutcome]]）。 */
  submitAt: number | null
  revealClass: boolean
  setRevealClass: (b: boolean) => void
  timetable: TimetableCollection[]
  /** 出席画面のフォーカス状態を通知する（起動ポリシー＋収集への優先権制御）。 */
  setAttendanceFocused: (b: boolean) => void
}

const Ctx = createContext<AttendanceEngineValue | null>(null)

// エンジンのクロック（受付中は毎秒更新）。本体contextから分離し、カウントダウン表示が必要な
// 消費者だけが毎秒再レンダーされるようにする（本体valueはuseMemoで状態変化時のみ差し替え）。
const NowCtx = createContext<Date | null>(null)

export function useAttendanceEngine(): AttendanceEngineValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAttendanceEngine must be used within AttendanceEngineProvider')
  return v
}

/** エンジンのクロック（受付中は秒精度）。カウントダウン等、時刻追随が必要な画面だけが購読する。 */
export function useAttendanceNow(): Date {
  const v = useContext(NowCtx)
  if (!v) throw new Error('useAttendanceNow must be used within AttendanceEngineProvider')
  return v
}

export function AttendanceEngineProvider({ children }: { children: ReactNode }) {
  const webviewRef = useRef<WebViewInstance>(null)
  const portalTriesRef = useRef(0)
  const errorRetryRef = useRef(0)
  // navTimeout の再試行回数（出席ページ到達 or 手動リブートで0に戻す）。
  const navTimeoutRetryRef = useRef(0)
  const phaseRef = useRef<EnginePhase>('booting')
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loginGate = useLoginGate()
  const killSwitch = useKillSwitch()
  // デモ中はCLASSへ一切アクセスしない。Provider 自体は context 供給のため残す
  // （useAttendanceEngine は Provider 不在で throw し、ホーム/時間割/出席の各画面が使う）。
  const { active: demo } = useDemo()
  const { collectActive, setAttendanceFocused: arbiterSetFocused } = useClassView()
  const collectActiveRef = useRef(false)
  collectActiveRef.current = collectActive
  const onAttendanceRef = useRef(false)
  const attendedRef = useRef(false)
  const attendedRecordRef = useRef<AttendedRecord | null>(null)
  const lastCodeRef = useRef('')
  // 1回の送信操作あたりの自動再送回数（submit() で0に戻す）。
  const submitRetryRef = useRef(0)

  const [state, dispatch] = useReducer(attendanceReducer, initialEngineState)
  const [code, setCode] = useState('')
  const [webviewKey, setWebviewKey] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [revealClass, setRevealClass] = useState(false)
  // 直近の送信時刻。submitOutcome の確認窓（無期限の「確認しています」を防ぐ）の起点。
  const [submitAt, setSubmitAt] = useState<number | null>(null)
  const [failCount, setFailCount] = useState(0)
  const [attended, setAttended] = useState<AttendedRecord | null>(null)
  const [receptionWindow, setReceptionWindow] = useState<ReceptionWindowRecord | null>(null)
  const [timetable, setTimetable] = useState<TimetableCollection[]>([])
  // onMessage クロージャから最新の時間割を読むための ref（受付open通知の科目別OFF判定に使う）。
  const timetableRef = useRef<TimetableCollection[]>([])
  timetableRef.current = timetable
  const [attendanceFocused, setAttendanceFocusedState] = useState(false)
  const [conflict, setConflict] = useState(false)
  // アプリ内リアペ提出の進行状態。ref はタイマー/onMessage クロージャからの最新参照用。
  const [reactionSubmitState, setReactionSubmitState] = useState<ReactionSubmitState>({ status: 'idle', message: null })
  const reactionBusyRef = useRef(false)
  const reactionTextRef = useRef('')
  const reactionFillTriesRef = useRef(0)
  // この提出が「必須」だったか（submitReaction 時点の状態で確定させる。提出後は状態が変わるため
  // 都度参照だと判定がぶれる）。必須=.attendSuc 待ち／任意=リアペが提出済みになるのを待つ。
  const reactionRequiredRef = useRef(false)
  // リアペが提出済みか（.reactionMsg）の最新値。任意提出の成功確定に使う。
  const reactionSubmittedRef = useRef(false)
  // 提出開始時に既に提出済みだったか（＝今回は「再提出」）。再提出は提出済みフラグが変化しないので、
  // 成功確定にそれを使えない（ajax完走を確定点にする）。
  const reactionWasSubmittedRef = useRef(false)
  // 提出ajaxが完走したか（reactionSubmit actuator の観測結果）。再提出の確定点。
  const reactionAjaxOkRef = useRef(false)
  // 提出ajaxの観測値（診断に残すため保持。reactionAjaxOkRef は成否の判定用で値を持たない）。
  const reactionAjaxDoneRef = useRef<boolean | undefined>(undefined)
  const reactionAjaxStatusRef = useRef<number | undefined>(undefined)
  const reactionAjaxErrorRef = useRef<string | undefined>(undefined)
  const reactionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // 上限到達で自動再試行を打ち切った状態。UIの案内文を切り替えるため state で持つ。
  const [conflictExhausted, setConflictExhausted] = useState(false)
  // 再試行スケジューラの内部状態（タイマークロージャから最新値を読むため ref）。
  const conflictRef = useRef(false)
  const conflictAttemptRef = useRef(0)
  const conflictTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastConflictAttemptAtRef = useRef(0)
  conflictRef.current = conflict
  // ポーリング条件を最新の受付状態で判定するための ref（interval クロージャの stale 回避）。
  const receptionStatusRef = useRef<AttendanceStatus | undefined>(undefined)
  receptionStatusRef.current = state.reception?.status
  reactionSubmittedRef.current = state.reception?.reactionSubmitted === true
  // 直近で保存した受付時間の**日付込みキー**（`YYYY-MM-DD|10:20〜12:00`）。同一値の再書き込みを
  // 避けるためのもの（ポーリングは数秒ごとに同じ rec を運ぶ）。
  // **日付を必ず含めること**: confirmWindow は時限の時刻から作られるので、同じコマなら別の日・別の
  // 科目でも完全に同一文字列になる（毎週の月2限は常に '10:20〜12:00'）。window だけを鍵にすると、
  // 起動時に前回の記録で ref を埋めた後、翌週の同じコマで「同じ値だから書かない」と判定してしまい、
  // 保存の date が古いまま → homeRemaining が日付で弾く → ホームが黙って授業ベースへ後退する。
  const savedWindowRef = useRef<string | null>(null)
  const windowKey = (date: string, window: string) => `${date}|${window}`

  phaseRef.current = state.phase

  // 起動ポリシー: 授業時間帯 または 出席画面フォーカス中。停止中は WebView をアンマウント。
  // リモートkill switch（attendance）中はどちらでも起動しない（Provider自体は
  // BackgroundBulletinSync等がcontextを消費するためアンマウントできない。ここで止める）。
  // CLASSメンテ帯・オフライン中も起動しても失敗するだけなので抑止する。
  const isOnline = useConnectivity()
  const classAccessible = evaluateAccess('class', { now, isOnline }).allowed
  const running =
    !demo &&
    !killSwitch.isKilled('attendance') &&
    classAccessible &&
    (attendanceFocused || isInClassPeriod(timetable, now))
  const shouldRender = running && !collectActive
  const prevRenderRef = useRef(false)
  const shouldRenderRef = useRef(false)
  shouldRenderRef.current = shouldRender

  // WebViewを作り直して最初から遷移し直す。競合の再試行スケジューラもここで初期化する。
  // lastConflictAttemptAtRef を必ず更新することで、直後に走る復帰トリガーが
  // CONFLICT_MIN_GAP_MS に阻まれて二重リブートしない。
  function rebootWebview() {
    portalTriesRef.current = 0
    errorRetryRef.current = 0
    navTimeoutRetryRef.current = 0
    // 進行中のリアペ提出タイマーと busy フラグを畳む。畳まないと、作り直した booting 中の SSO WebView へ
    // 残留タイマーが OPEN_ATTENDANCE_JS/DETECT を撃ち込んで遷移を撹乱し（stale/other 着地の一因）、
    // reactionBusy が真のまま自己回復（ポーリング・前面復帰リフレッシュ）を止めてしまう。
    resetReaction()
    lastConflictAttemptAtRef.current = Date.now()
    dispatch({ kind: 'reboot' })
    setWebviewKey((k) => k + 1)
  }

  // shouldRender が false→true になったら WebView を作り直して最初から遷移（収集返却・授業入り・
  // 出席フォーカス取得のいずれでも同じ再起動）。reception はキャッシュ保持。
  // conflict は「今のページがそう分類された」という判定結果なので、作り直す以上いったん偽に戻す。
  // 戻さないと再分類で再び conflict になっても依存が変化せず、スケジューラが張り直されない。
  // 注意: 以下の useEffect は [attendanceFocused] effect より先に配置する必要がある。
  // rebootWebview() で lastConflictAttemptAtRef を更新し、直後に走る resumeConflictRetry() が
  // CONFLICT_MIN_GAP_MS で阻止され、同じ commit 内の二重リブートが防がれる。
  useEffect(() => {
    if (shouldRender && !prevRenderRef.current) {
      conflictAttemptRef.current = 0
      setConflictExhausted(false)
      setConflict(false)
      rebootWebview()
    }
    prevRenderRef.current = shouldRender
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender])

  // 時間割を読み込む（起動ポリシー判定用）。前面復帰時も貼り直す（オーケストレータの即時スロット）。
  useEffect(() => {
    loadTimetable().then((t) => setTimetable(t ?? [])).catch(() => undefined)
    return subscribeForeground('timetableReload', () =>
      loadTimetable().then((t) => setTimetable(t ?? [])).catch(() => undefined),
    )
  }, [])

  // booting を抜けたらナビタイマーを止める。
  useEffect(() => {
    if (state.phase !== 'booting' && navTimerRef.current) {
      clearTimeout(navTimerRef.current)
      navTimerRef.current = null
    }
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current)
    }
  }, [state.phase])

  // 取得失敗に入るたびに回数を数える（数回でCLASS表示ボタンを解禁）。
  useEffect(() => {
    if (state.phase === 'navFailed') setFailCount((n) => n + 1)
  }, [state.phase])

  // フォアグラウンド復帰時に再判定/リフレッシュ（オーケストレータのattendanceスロット）。送信中はスキップ。
  useEffect(() => {
    return subscribeForeground('attendance', () => {
      if (phaseRef.current === 'submitting' || reactionBusyRef.current || !shouldRenderRef.current) return
      // 競合中の前面復帰は「PCを閉じて戻ってきた」可能性が高い。バックオフを畳み直して即1回試す。
      if (conflictRef.current) {
        resumeConflictRetry()
        return
      }
      if (onAttendanceRef.current) refreshAttendance()
      else webviewRef.current?.injectJavaScript(DETECT_PAGE_JS)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 出席ページ滞在中は定期的にサーバから受付状況を取り直す（開きっぱなしで授業が始まったら
  // 自動で「受付中」に切り替わるように）。収集使用中・送信中・出席済みは触らない。
  useEffect(() => {
    const id = setInterval(() => {
      // 受付状況の取り直しは「出席済み以外」のとき（受付なし none・受付終了 closed も拾う）。
      // none/closed も取り直すのは、教員が受付を開き直す再受付ケース（間に合わなかった学生向け・実在）を
      // 受付open通知で拾うため。attended は取り直す意味がないので除外を維持。送信中/収集中/競合は無駄打ち。
      if (
        receptionStatusRef.current !== 'attended' &&
        onAttendanceRef.current &&
        shouldRenderRef.current &&
        !collectActiveRef.current &&
        phaseRef.current !== 'submitting' &&
        !reactionBusyRef.current // リアペ提出中は②フォーム上に居る。取り直しで流し込みを壊さない
      ) {
        refreshAttendance()
      }
    }, ATTENDANCE_POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 受付中かつ確認時間が取れていれば毎秒 now を更新（カウントダウン）。それ以外は粗いクロックで
  // isInClassPeriod/バナー判定を回す。
  useEffect(() => {
    const fast = !!(state.reception?.accepting && state.reception.confirmWindow)
    const id = setInterval(() => setNow(new Date()), fast ? 1000 : 30000)
    return () => clearInterval(id)
  }, [state.reception])

  // 出席のフォーカスをアービタへ通知（前面のあいだCLASSは出席が絶対優先で保持）。
  useEffect(() => {
    arbiterSetFocused(attendanceFocused)
  }, [attendanceFocused, arbiterSetFocused])

  // 出席画面を開いた瞬間も復帰トリガー。授業時間帯は shouldRender が真のままなので
  // 再起動 effect が走らず、これがないと打ち切り後に手動操作でしか復帰できない。
  // 注意: shouldRender effect と同じ commit 内で両者が発火する場合、実行順序に依存。
  // その時点で conflictRef.current は stale 状態なため、二重リブート防止は
  // conflictRef ガードではなく CONFLICT_MIN_GAP_MS の gap check が担当する。
  useEffect(() => {
    if (attendanceFocused) resumeConflictRetry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceFocused])

  // 「出席済み」記録の読み込み（起動時）。
  useEffect(() => {
    loadAttendedRecord().then(setAttended).catch(() => undefined)
    // 起動時に復元する。エンジンが動く前（ホームを開いた直後）でも、同じコマの受付時間なら
    // 「受付あと○分」を出せる＝再起動しても表示が授業ベースへ後退しない。
    loadReceptionWindow()
      .then((r) => {
        setReceptionWindow(r)
        // 復元した記録の**日付ごと**キーで埋める。日付を落とすと翌日以降に同じコマの受付時間を
        // 見ても「既に保存済み」と誤判定して保存が止まる。
        savedWindowRef.current = r ? windowKey(r.date, r.window) : null
      })
      .catch(() => undefined)
  }, [])

  // アンマウント時にリアペ提出フローのタイマーを畳む（リーク・遅延injectの防止）。
  useEffect(() => {
    return () => clearReactionTimers()
  }, [])

  function clearConflictTimer() {
    if (conflictTimerRef.current) {
      clearTimeout(conflictTimerRef.current)
      conflictTimerRef.current = null
    }
  }

  // 次の再試行を予約する。上限に達していたら予約せず打ち切り、UIへ知らせる。
  function scheduleConflictRetry() {
    clearConflictTimer()
    if (isConflictExhausted(conflictAttemptRef.current)) {
      setConflictExhausted(true)
      return
    }
    const delay = conflictDelayMs(conflictAttemptRef.current, Math.random())
    conflictTimerRef.current = setTimeout(() => {
      conflictTimerRef.current = null
      // 競合が解けた／WebViewが止まったなら何もしない。後者は shouldRender の
      // 再起動 effect が conflict を偽に戻すので、そこから綺麗にやり直される。
      if (!conflictRef.current || !shouldRenderRef.current) return
      conflictAttemptRef.current += 1
      rebootWebview()
      scheduleConflictRetry()
    }, delay)
  }

  // 上限到達後の復帰トリガー（前面復帰・画面フォーカス・再確認ボタン）から呼ぶ。
  // 「ユーザーが今このアプリを見ている」という意思表示があったときだけバックオフを畳み直す。
  function resumeConflictRetry() {
    if (!conflictRef.current || !shouldRenderRef.current) return
    if (Date.now() - lastConflictAttemptAtRef.current < CONFLICT_MIN_GAP_MS) return
    conflictAttemptRef.current = 1
    setConflictExhausted(false)
    rebootWebview()
    scheduleConflictRetry()
  }

  // PC競合中は指数バックオフで静かに再試行する（PCを閉じたら正常ページに着地→自動復帰）。
  // 注意: !conflict の分岐でタイマーを止めるだけにとどめ、conflictAttemptRef/conflictExhausted は
  // ここでリセットしない。競合再試行のリブートはCLASSのURLへ入り直すためSSOチェーンを再び歩き、
  // その途中でportal等の非conflictページを一時的に経由する（セッションが生きていればloginには
  // 分類されない。分類されればloginGate.requireLogin()でエンジンごとアンマウントされてしまうため）。
  // その通過点はonMessageの `if (kind !== 'conflict') setConflict(false)` でconflictを偽に戻す。
  // ここでカウンタを毎回0に戻すと「偽→競合ページ着地で真」が繰り返され、試行回数が0↔1を往復して
  // 打ち切りに到達できなくなる。
  useEffect(() => {
    if (!conflict) {
      clearConflictTimer()
      return
    }
    scheduleConflictRetry()
    return clearConflictTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict])

  function inject(js: string) {
    webviewRef.current?.injectJavaScript(js)
  }

  function armNavTimeout() {
    if (navTimerRef.current) clearTimeout(navTimerRef.current)
    navTimerRef.current = setTimeout(onNavTimeout, NAV_TIMEOUT_MS)
  }

  // ナビ（SSO→出席ページ）が時間内に着かなかったとき、いきなり navFailed にせず、数回だけ
  // WebViewを作り直して再試行する（errorPage の autoRestart と同型）。初回起動はSSOチェーンで
  // 時間がかかることがあり、単発タイムアウトで「取得できませんでした」を出すと、実際は出席登録が
  // 済んでCLASSも正常なのに失敗表示になってしまう。競合中・非表示中は再試行しない（別経路が担う）。
  function onNavTimeout() {
    if (navTimeoutRetryRef.current < NAV_TIMEOUT_RETRIES && shouldRenderRef.current && !conflictRef.current) {
      navTimeoutRetryRef.current += 1
      portalTriesRef.current = 0
      dispatch({ kind: 'reboot' })
      setWebviewKey((k) => k + 1)
    } else {
      dispatch({ kind: 'navTimeout' })
    }
  }

  function autoRestart() {
    if (errorRetryRef.current < 2) {
      errorRetryRef.current += 1
      portalTriesRef.current = 0
      dispatch({ kind: 'reboot' })
      setWebviewKey((k) => k + 1)
    } else {
      dispatch({ kind: 'errorPage' })
    }
  }

  function refreshAttendance() {
    inject(OPEN_ATTENDANCE_JS)
    setTimeout(() => inject(DETECT_ATTENDANCE_JS), 1600)
  }

  // ---- アプリ内リアペ提出フロー（reaction_pending → ②フォーム遷移 → 流し込み+提出 → ③検知で確定）----
  // タイミング制御（JSF postbackのAJAX再描画待ち）はここに集約し、判定は純粋関数
  // （parseReactionMessage / parseAttendanceMessage）に寄せる。全タイマーは reactionTimersRef で
  // 一括解除できるようにし、成功（attended検知）・失敗・retry() のどこからでも安全に畳める。
  function scheduleReaction(fn: () => void, ms: number) {
    reactionTimersRef.current.push(setTimeout(fn, ms))
  }

  function clearReactionTimers() {
    for (const id of reactionTimersRef.current) clearTimeout(id)
    reactionTimersRef.current = []
  }

  /**
   * リアペ提出の診断を記録する（出席送信と同じ「出席送信の記録」へ）。
   * 提出の失敗は v98 まで**どこにも残っていなかった**ため、テスターが画面を撮り忘れると原因が消えた
   * （2026-07-20 実機報告）。全終端（成功・各失敗・確認タイムアウト）から必ず呼ぶこと。
   * 本文そのものは渡さない（長さだけ）。
   */
  function recordReactionDiag(outcome: ReactionOutcome) {
    addSubmitDiag(
      toReactionDiag(
        {
          outcome,
          required: reactionRequiredRef.current,
          resubmit: reactionWasSubmittedRef.current,
          length: reactionTextRef.current.length,
          ajaxDone: reactionAjaxDoneRef.current,
          ajaxStatus: reactionAjaxStatusRef.current,
          ajaxError: reactionAjaxErrorRef.current,
        },
        {
          nowIso: new Date().toISOString(),
          courseName: state.reception?.courseName ?? null,
          // ②フォーム待ちのポーリング回数。form-missing で落ちた時に「何秒待ったか」が分かる。
          note: reactionFillTriesRef.current > 0 ? `②待ち${reactionFillTriesRef.current}回` : undefined,
        },
      ),
    ).catch(() => undefined)
  }

  function failReaction(message: string, outcome: ReactionOutcome) {
    clearReactionTimers()
    reactionBusyRef.current = false
    recordReactionDiag(outcome)
    setReactionSubmitState({ status: 'failed', message })
  }

  function resetReaction() {
    clearReactionTimers()
    reactionBusyRef.current = false
    setReactionSubmitState((s) => (s.status === 'idle' && s.message === null ? s : { status: 'idle', message: null }))
  }

  function submitReaction(text: string) {
    if (reactionBusyRef.current) return
    if (!canSubmitReaction(text)) return
    if (!shouldRenderRef.current || collectActiveRef.current) {
      // WebView停止中（授業時間外で画面も非フォーカス等）や収集使用中は流し込み先が無い。
      setReactionSubmitState({ status: 'failed', message: 'CLASSに接続できていません。少し待ってからやり直してください' })
      return
    }
    reactionTextRef.current = text
    reactionFillTriesRef.current = 0
    // 提出開始時の状態で「必須か」「既に提出済みか（＝再提出）」を確定させる
    // （提出後は状態が変わるので後から見ない）。
    reactionRequiredRef.current = receptionStatusRef.current === 'reaction_pending'
    reactionWasSubmittedRef.current = reactionSubmittedRef.current
    reactionAjaxOkRef.current = false
    reactionAjaxDoneRef.current = undefined
    reactionAjaxStatusRef.current = undefined
    reactionAjaxErrorRef.current = undefined
    reactionBusyRef.current = true
    setReactionSubmitState({ status: 'sending', message: null })
    inject(OPEN_REACTION_FORM_JS)
    // 応答が一切来ない場合の最終保険（進行できていれば fill 側の確認タイマーが先に決着させる）。
    scheduleReaction(() => {
      if (reactionBusyRef.current) {
        failReaction('提出を確認できませんでした。本文は保存されています。「CLASSの画面で書く」から状況を確認してください', 'unconfirmed')
      }
    }, 20000)
  }

  function onLoadEnd() {
    if (state.phase === 'booting') armNavTimeout()
    inject(DETECT_PAGE_JS)
  }

  function onMessage(data: string) {
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (!parsed) return
    if (parsed.type === 'page') {
      const kind = classifyClassPage({
        hasPasswordInput: !!parsed.hasPasswordInput,
        hasAttendanceForm: !!parsed.hasAttendanceForm,
        hasEnterSplash: !!parsed.hasEnterSplash,
        hasClassMenu: !!parsed.hasClassMenu,
        // 出席ページの不変マーカー（前の授業/次の授業）。渡さないと出席済みページ（フォーム消滅）が
        // portal に落ち、着地しているのに navFailed になる（実機バグ 2026-07-17）。
        hasAttendanceNav: !!parsed.hasAttendanceNav,
        hasSystemError: !!parsed.hasSystemError,
        hasMultiScreen: !!parsed.hasMultiScreen,
        // SSO stale（過去のリクエスト/CSRF）を渡さないと 'other' に落ち、booting のまま navFailed になる。
        // DETECT_PAGE_JS は hasSsoStale を出しているが従来ここで捨てていた（本バグの発生源）。
        hasSsoStale: !!parsed.hasSsoStale,
        url: typeof parsed.url === 'string' ? parsed.url : undefined,
      })
      dispatch({ kind: 'page', page: kind })
      onAttendanceRef.current = kind === 'attendance'
      if (kind !== 'conflict') setConflict(false)
      if (kind === 'login') {
        loginGate.requireLogin()
      } else if (kind === 'conflict') {
        // PC等の他画面と競合。自動やり直しでは解けないので専用表示にし、navタイマーは止めて
        // navFailed へ落とさない。復帰は指数バックオフの再試行スケジューラに任せる（PCを閉じたら回復）。
        if (navTimerRef.current) {
          clearTimeout(navTimerRef.current)
          navTimerRef.current = null
        }
        setConflict(true)
      } else if (kind === 'attendance') {
        // 出席ページ着地だけが競合解消の確実なシグナル。login/splash/portal はいずれも
        // SSOチェーンの通過点になり得るため、そこでリセットしてはならない。
        conflictAttemptRef.current = 0
        setConflictExhausted(false)
        portalTriesRef.current = 0
        errorRetryRef.current = 0
        navTimeoutRetryRef.current = 0
        inject(DETECT_ATTENDANCE_JS)
      } else if (kind === 'splash') {
        inject(ENTER_CLASS_PC_JS)
      } else if (kind === 'portal') {
        if (portalTriesRef.current < 2) {
          portalTriesRef.current += 1
          inject(OPEN_ATTENDANCE_JS)
          setTimeout(() => inject(DETECT_PAGE_JS), 1500)
        } else {
          autoRestart()
        }
      } else if (kind === 'error') {
        autoRestart()
      }
      return
    }
    if (parsed.type === 'nav') {
      return
    }
    if (parsed.type === 'reaction') {
      const m = parseReactionMessage(data)
      if (!m || !reactionBusyRef.current) return
      if (m.kind === 'open') {
        if (!m.ok) {
          failReaction('リアクションペーパーの画面を開けませんでした。「CLASSの画面で書く」から提出してください', 'open-failed')
          return
        }
        // ①→②はPrimeFacesのAJAX postback（ページロードなし＝onLoadEnd不発）。再描画を待って流し込む。
        scheduleReaction(() => inject(buildSubmitReactionJs(reactionTextRef.current)), 1800)
        return
      }
      // m.kind === 'fill'
      if (m.ok) {
        // 提出ajaxが完走したか（再提出の確定点）。観測できない古い経路では undefined → false のまま。
        reactionAjaxOkRef.current = m.ajaxDone === true && (m.ajaxStatus ?? 200) < 400
        reactionAjaxDoneRef.current = m.ajaxDone
        reactionAjaxStatusRef.current = m.ajaxStatus
        reactionAjaxErrorRef.current = m.ajaxError
        // 提出発火済み。応答テキストに頼らず、出席ページを取り直して**確定マーカー**で判定する。
        // 確定マーカーは提出の種類で違う:
        //  ・必須(reaction_pending由来): .attendSuc（提出して初めて「出席」になる）
        //  ・任意(それ以外): リアペが「提出済み」になる＝reactionAvailable が false になること。
        //    任意提出は出席と紐づかないので .attendSuc を待つと**成功しても必ず失敗表示**になる。
        //  ・必須(reaction_pending由来): .attendSuc（提出して初めて「出席」になる）
        //  ・任意の初回提出: リアペが「提出済み」になること
        //  ・再提出（既に提出済みの本文を編集）: 提出済みフラグは変化しないので、
        //    提出ajaxが完走したことを確定点にする（actuator の観測結果）。
        const doneNow = () =>
          reactionRequiredRef.current
            ? receptionStatusRef.current === 'attended'
            : reactionWasSubmittedRef.current
              ? reactionAjaxOkRef.current
              : reactionSubmittedRef.current
        scheduleReaction(() => {
          if (shouldRenderRef.current && !collectActiveRef.current) refreshAttendance()
        }, 2500)
        scheduleReaction(() => {
          if (shouldRenderRef.current && !collectActiveRef.current && !doneNow()) {
            refreshAttendance()
          }
        }, 6000)
        scheduleReaction(() => {
          if (reactionBusyRef.current && !doneNow()) {
            failReaction('提出結果を確認できませんでした。本文は保存されています。「CLASSの画面で書く」から状況を確認してください', 'unconfirmed')
          } else if (reactionBusyRef.current) {
            // 成功も記録する（失敗だけ残すと「出せた時は何が違ったのか」を後から比べられない）。
            recordReactionDiag('ok')
            // 任意提出の成功確定（必須は attendance ハンドラ側の resetReaction が畳む）。
            // **下書きは消さない**: CLASSは再提出を許すので、次に「編集」で開いた時に提出した本文が
            // 出ないと編集できない（別授業への誤復元は reactionDraftApplies の日付＋科目照合が防ぐ）。
            resetReaction()
          }
        }, 11000)
        return
      }
      if (m.reason === 'form-missing' && reactionFillTriesRef.current < REACTION_FILL_MAX_TRIES) {
        // ②フォームがまだ描画されていない。**着地するまで短間隔でポーリングする**（固定1回では
        // 遅い回線で②の描画に間に合わず form-missing で落ちる＝収集エンジンで踏んだ穴と同型）。
        reactionFillTriesRef.current += 1
        scheduleReaction(() => inject(buildSubmitReactionJs(reactionTextRef.current)), REACTION_FILL_RETRY_MS)
        return
      }
      failReaction(
        m.reason === 'stub'
          ? 'このビルドではアプリ内提出を使えません。「CLASSの画面で書く」から提出してください'
          : m.reason === 'verify-failed'
            ? '本文を正しく流し込めたか確認できませんでした。「CLASSの画面で書く」から提出してください'
            : '提出画面を操作できませんでした。「CLASSの画面で書く」から提出してください',
        // reason をそのまま診断へ落とす（UIは3文言に畳むが、記録では5種を区別する）。
        m.reason,
      )
      return
    }
    if (parsed.type === 'attendance') {
      const rec = parseAttendanceMessage(data)
      // dispatch前のrefは遷移前status（refは各レンダーで更新されるため、このハンドラ内では旧値）。
      const prevStatus = receptionStatusRef.current
      dispatch({ kind: 'reception', reception: rec })
      // 受付時間を見たら保存する（**出席する前から**）。ホームは大学へ追加アクセスせずに
      // 「出席の受付があと何分か」を出せるようになる（従来は時限終了までを一律「残り」と表示し、
      // その面のタップ先が出席登録＝受付が先に閉じる授業で誤読を生んでいた）。
      // confirmWindow は静的な時刻レンジなので保存しても腐らない（remaining は静止値なので保存しない）。
      // 解析できない値は書かない＝読み手は授業ベースへ安全に落ちる。
      if (rec.confirmWindow && parseWindowMinutes(rec.confirmWindow)) {
        const date = todayKey(new Date())
        const key = windowKey(date, rec.confirmWindow)
        if (key !== savedWindowRef.current) {
          savedWindowRef.current = key
          const wrec: ReceptionWindowRecord = {
            date,
            window: rec.confirmWindow,
            courseName: rec.courseName,
          }
          setReceptionWindow(wrec)
          saveReceptionWindow(wrec).catch(() => undefined)
        }
      }
      // リアペ待ちへ「新規に」遷移した時、前回（別授業等）の失敗表示を持ち越さない。
      // busy中は同一提出フローの確認中なのでリセットしない。同一授業で status が
      // reaction_pending のまま続く限りはエッジが立たず、直近の失敗メッセージは残る。
      if (rec.status === 'reaction_pending' && prevStatus !== 'reaction_pending' && !reactionBusyRef.current) {
        setReactionSubmitState((s) => (s.status === 'failed' ? { status: 'idle', message: null } : s))
      }
      // 受付openローカル通知（即時発火・完全独立経路。refreshAllNotifications/serializeRunsは通らない）。
      // 検知はこの in-class ポーリングに依存し、ポーリングはWebViewが動く前面/授業中在席時にしか回らない
      // （WebViewはBG継続不可）＝バックグラウンド中の受付openは拾えない。抑制条件（accepting以外/出席済み/
      // 出席画面フォーカス中/通知済み）は純粋関数 shouldNotifyAttendanceOpen が単独で決める。
      // 失敗は握りつぶす（受付状況の表示・出席登録は通知の成否に依存せず成立）。
      if (rec.status === 'accepting') {
        const nowD = new Date()
        const key = attendanceOpenKey({ courseName: rec.courseName, confirmWindow: rec.confirmWindow, now: nowD })
        ;(async () => {
          const notified = await loadNotifiedAttendanceOpen()
          // 科目別OFF（設定画面「出席アラーム（科目別）」）を受付open通知にも効かせる。
          // 設定は courseCode 鍵・受付は科目名しか持たないので時間割で橋渡しする。
          // 引けなければ undefined＝通知する側に倒す（黙って通知を殺さない）。
          const code = courseCodeByName(timetableRef.current, rec.courseName)
          const settings: AttendanceAlarmSettings = await loadAttendanceSettings().catch(() => ({}))
          if (
            shouldNotifyAttendanceOpen({
              status: rec.status,
              attendedNow: attendedRef.current,
              attendanceFocused,
              key,
              notifiedKeys: notified,
              courseDisabled: code ? settings[code] === false : false,
            })
          ) {
            await presentAttendanceOpenNotification(buildAttendanceOpenContent(rec))
            // 授業開始の予約アラームとほぼ同時刻に鳴るため、推測ベースの開始アラームは畳む
            // （受付open通知のほうが「受付中（時刻）」まで言える上位互換）。MAXチャンネルで
            // 立て続けに2つ鳴るのを止める（実機報告「一気に2つきてうるさい」）。
            await clearDeliveredAttendanceStartNotifications(code).catch(() => undefined)
            await mutateNotifiedAttendanceOpen((ks) => pruneNotifiedAttendanceKeys([...ks, key], todayKey(nowD)))
          }
        })().catch(() => undefined)
      }
      // CLASSが「出席済み」を示したら、どのデバイスで出していても記録を更新（授業間の継続表示・
      // オフライン補助）。CLASSの状態が正。配信済みの受付open通知も消す（自分の送信/別デバイス出席いずれも）。
      if (rec.status === 'attended') {
        // リアペ**必須**の提出フロー中（または直前までリアペ待ち）だった場合はここが成功の確定点。
        // 進行状態を畳み、保全していた下書きを消す（提出済み本文を別授業へ誤復元しない）。
        // 任意提出は出席と紐づかない（元から出席済みでもあり得る）ので、ここを確定点にすると
        // **提出の成否を見ないまま下書きを消す**。任意の確定は reactionAvailable が false になること
        // （fill後の11秒判定 doneNow が担う）。
        const requiredFlow = reactionBusyRef.current && reactionRequiredRef.current
        if (requiredFlow || (!reactionBusyRef.current && receptionStatusRef.current === 'reaction_pending')) {
          // 必須リアペの成功確定点（.attendSuc＝出席になった）。提出フロー中のときだけ記録する。
          if (reactionBusyRef.current) recordReactionDiag('ok')
          resetReaction()
          clearReactionDraft().catch(() => undefined)
        }
        clearDeliveredAttendanceOpenNotifications().catch(() => undefined)
        const d = new Date()
        // 受付の文脈（科目名・受付時間）がどちらも無いときは記録しない。記録すると isAttendedNow が
        // 「終了時刻が1つも無い」分岐で**その日ずっと true** を返し、「（科目名不明）出席済み」が居座って
        // 後の本物の授業のコード入力を塞ぐ（実機事象）。このガードは以前 result.ok 側の書き込みにだけ
        // 付いていたが、そちらを廃止して**唯一の書き手になったここ**へ移した。
        if (canRecordAttendance(rec.courseName ?? '', rec.confirmWindow ?? null)) {
          // 再アクセス/別デバイス出席では lastCodeRef が空。既存の同日記録のコードを引き継いで消さない。
          const arec = mergeAttendedRecord(attendedRecordRef.current, {
            date: todayKey(d),
            courseName: rec.courseName ?? '',
            confirmWindow: rec.confirmWindow ?? null,
            code: lastCodeRef.current,
          })
          setAttended(arec)
          saveAttendedRecord(arec).catch(() => undefined)
          notifyWidgetDataChanged()
        }
      }
      return
    }
    if (parsed.type === 'submit') {
      const result: SubmitResult = {
        result: typeof parsed.result === 'string' ? parsed.result : '送信しました',
        ok: !!parsed.ok,
        wrong: !!parsed.wrong,
        err: !!parsed.err,
        // 診断を捨てない: btnFound=false は「送信していない」の確定シグナル（submitOutcome が失敗判定に使う）。
        // onclick/filled は「送信は発火しているのに登録されない」ときの原因特定に要る（process範囲など）。
        btnFound: typeof parsed.btnFound === 'boolean' ? parsed.btnFound : undefined,
        method: typeof parsed.method === 'string' ? parsed.method : undefined,
        onclick: typeof parsed.onclick === 'string' ? parsed.onclick : undefined,
        filled: Array.isArray(parsed.values) ? parsed.values.filter((v) => !!v).length : undefined,
        // ajaxの直接観測（届いたか/返ってきたか）とCLASSの応答文言。原因特定の要。
        ajaxFired: typeof parsed.ajaxFired === 'boolean' ? parsed.ajaxFired : undefined,
        ajaxDone: typeof parsed.ajaxDone === 'boolean' ? parsed.ajaxDone : undefined,
        ajaxError: typeof parsed.ajaxError === 'string' && parsed.ajaxError ? parsed.ajaxError : undefined,
        ajaxStatus: typeof parsed.ajaxStatus === 'number' ? parsed.ajaxStatus : undefined,
        hint: typeof parsed.hint === 'string' && parsed.hint ? parsed.hint : undefined,
        // ok=true の根拠。判定だけ残して根拠を捨てていたため誤報の原因を追えなかった（2026-07-22）。
        okBy: typeof parsed.okBy === 'string' && parsed.okBy ? parsed.okBy : undefined,
        noneNow: typeof parsed.noneNow === 'boolean' ? parsed.noneNow : undefined,
      }
      // 診断を端末に貯める（成功も失敗も）。真因未特定の間欠バグの証拠を、ユーザーが
      // その瞬間を捕まえなくても後から設定画面で見返せるようにする。失敗は無視。
      const retrying = shouldAutoRetrySubmit({
        result,
        tries: submitRetryRef.current,
        attended: receptionStatusRef.current === 'attended',
        hasCode: !!lastCodeRef.current,
      })
      addSubmitDiag(
        toSubmitDiag(result, {
          nowIso: new Date().toISOString(),
          courseName: state.reception?.courseName ?? null,
          note: retrying ? '自動再送します（CLASSに届いていないため）' : undefined,
        }),
      ).catch(() => undefined)
      if (retrying) {
        // 送信がCLASSに**到達していない**と確定した時だけ1回だけ再送する（到達していない以上、
        // 二重登録にならないのが根拠）。応答が返っている場合は曖昧なので再送しない。
        submitRetryRef.current += 1
        // 確認窓（submitOutcome の12秒）も再送時点から測り直す。
        setSubmitAt(Date.now())
        dispatch({ kind: 'submitStart' })
        setTimeout(() => {
          if (shouldRenderRef.current && !collectActiveRef.current && receptionStatusRef.current !== 'attended') {
            inject(buildSubmitAttendanceJs(lastCodeRef.current))
          }
        }, 1200)
        return
      }
      dispatch({ kind: 'submitResult', result })
      // **送信が成功したこと（result.ok）で出席記録を書いてはいけない。**
      // result.ok は送信応答の文言一致（/出席しました|登録しました|…/）でしかなく、
      // 「コードは受理されたがリアクションペーパー未提出＝まだ出席していない」授業を区別できない。
      // ここで記録すると attendedNow が立ち、リアペ提出画面が出ないまま「出席済み」を見せて
      // ユーザーを欠席させる（実機 2026-07-17）。記録は下の .attendSuc 確認（rec.status==='attended'）
      // に一本化する＝直下のコメントが元々宣言していた設計に実装を合わせる。
      // 送信自体の成否表示は submitOutcome が result.ok を見て別途行うので、ここで書く必要はない。

      // 送信後は応答テキスト解析に頼らず、CLASSの確定マーカー(.attendSuc)で「出席済み」を確認する。
      // 出席ページを取り直し、出席済みなら attended に遷移（＝リング→出席済み表示）。まだなら受付フォームに戻る。
      // 送信成功時のテキスト検出が「送信しました」止まりでも、これで確実に出席済みへ切り替わる。
      setTimeout(() => {
        if (shouldRenderRef.current && !collectActiveRef.current) refreshAttendance()
      }, 2500)
      setTimeout(() => {
        if (shouldRenderRef.current && !collectActiveRef.current && receptionStatusRef.current !== 'attended') {
          refreshAttendance()
        }
      }, 6000)
    }
  }

  function submit() {
    const c = normalizeAttendanceCode(code)
    if (!c) return
    lastCodeRef.current = c
    // 確認窓（submitOutcome）の起点。無期限に「確認しています」を出さないための基準時刻。
    setSubmitAt(Date.now())
    // 手動の送信操作ごとに自動再送の回数を戻す（1操作あたり最大 SUBMIT_MAX_RETRY 回）。
    submitRetryRef.current = 0
    dispatch({ kind: 'submitStart' })
    inject(buildSubmitAttendanceJs(c))
  }

  function retry() {
    setCode('')
    resetReaction()
    setRevealClass(false)
    clearConflictTimer()
    conflictAttemptRef.current = 0
    setConflictExhausted(false)
    dispatch({ kind: 'retry' })
    rebootWebview()
  }

  const setAttendanceFocused = useCallback((b: boolean) => setAttendanceFocusedState(b), [])

  // CLASSが出席済みを示していれば最優先。無ければローカル記録（授業間の継続表示・オフライン補助）。
  // 受付が授業より早く閉じても、出席済み表示は当該授業の時限終了まで延長する（次の授業が始まれば切れる）。
  //
  // **reaction_pending はローカル記録より強い**: CLASSが「出席登録は完了していません／リアクション
  // ペーパーを提出してください」と言っている＝**出席していないことの明示**。ここでローカル記録を
  // 優先させると「出席済み」を表示し、しかも AttendanceScreen の attended 分岐が showReactionForm
  // より先に来るためリアペ提出画面が到達不能になり、ユーザーは提出しないまま欠席する
  // （実機 2026-07-17・基礎電気数学及び演習: 実DOMは attendSuc 無し＋リアペ待ちなのに出席済み表示。
  //  データ全消去で正常化＝古いローカル記録が原因と確定）。CLASSの状態が正。
  const classEndMin = attendedClassEndMin(timetable, now, attended?.confirmWindow ?? null)
  const attendedNow = resolveAttendedNow(state.reception?.status, attended, now, classEndMin)
  attendedRef.current = attendedNow
  attendedRecordRef.current = attended

  // 秒間クロック(now)で毎レンダー作り直さないようメモ化する。now は NowCtx へ分離済みなので、
  // ここの依存は「状態が実際に変わった時」だけ変わる（出席カウントダウン中のアプリ全体再レンダー防止）。
  // submit/retry は毎レンダー再生成されるが、可変キャプチャは code のみ（依存に含む）。他は ref/setter/dispatch。
  // デモ用の出席状態。デモでは running=false でエンジンが動かないため受付状態が出ず、
  // 送信フローを審査員に見せられない。Apple は "exhibits your app's full features and
  // functionality" を要求するので、受付中の見た目を作って送信まで通す。
  // ネットワークには一切出ず、記録先もデモ名前空間（Storage 経由）。
  const [demoAttended, setDemoAttended] = useState<AttendedRecord | null>(null)
  const demoSubmit = useCallback(() => {
    setDemoAttended({
      date: todayKey(new Date()),
      courseName: DEMO_ATTENDANCE_COURSE,
      confirmWindow: demoWindow(new Date()),
      code: code || '0000',
    })
  }, [code])

  const value: AttendanceEngineValue = useMemo(
    () => ({
      phase: state.phase,
      reception: state.reception,
      result: state.result,
      attended,
      attendedNow,
      code,
      setCode,
      submit,
      retry,
      refreshAttendance,
      reactionSubmit: reactionSubmitState,
      submitReaction,
      running,
      receptionWindow,
      conflict,
      conflictExhausted,
      failCount,
      submitAt,
      revealClass,
      setRevealClass,
      timetable,
      setAttendanceFocused,
      ...(demo ? demoOverrides(demoAttended, demoSubmit, now) : null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      demo,
      demoAttended,
      demoSubmit,
      now,
      state.phase,
      state.reception,
      state.result,
      attended,
      attendedNow,
      code,
      reactionSubmitState,
      running,
      receptionWindow,
      conflict,
      conflictExhausted,
      failCount,
      submitAt,
      revealClass,
      timetable,
      setAttendanceFocused,
    ],
  )

  return (
    <Ctx.Provider value={value}>
      <NowCtx.Provider value={now}>{children}</NowCtx.Provider>
      {/* 自動遷移・受付検出は常にこの非表示WebView（画面外1x1）で進める。取得できない時だけ、
          ユーザーが明示的に「CLASSの画面を表示」を押した場合に限り全画面表示する（revealClass）。 */}
      <View
        style={revealClass ? styles.webviewOverlayBox : styles.webviewHiddenBox}
        pointerEvents={revealClass ? 'auto' : 'none'}
      >
        {shouldRender ? (
          <WebView
            key={webviewKey}
            ref={webviewRef}
            source={{ uri: `${CLASS_URL}?litus=a${webviewKey}` }}
            cacheEnabled={false}
            userAgent={DESKTOP_UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onLoadEnd={onLoadEnd}
            onMessage={(e) => onMessage(e.nativeEvent.data)}
            // ネットワーク断・5xx・レンダラプロセス死からの復帰（LoginGateと同じ三点セット。
            // autoRestart は errorRetryRef で回数上限つき＝無限リロードしない）。
            onError={() => autoRestart()}
            onHttpError={(e) => {
              if (e.nativeEvent.statusCode >= 500) autoRestart()
            }}
            onRenderProcessGone={() => autoRestart()}
            style={styles.webviewFill}
          />
        ) : null}
      </View>

      {revealClass ? (
        <View style={styles.overlayBar}>
          <Text style={styles.overlayText}>CLASSの画面です。出席登録を済ませたら「閉じる」を押してください。</Text>
          <Pressable
            style={styles.overlayBtn}
            onPress={() => {
              setRevealClass(false)
              inject(DETECT_PAGE_JS)
            }}
          >
            <Text style={styles.overlayBtnText}>閉じる</Text>
          </Pressable>
        </View>
      ) : null}
    </Ctx.Provider>
  )
}

const styles = StyleSheet.create({
  webviewHiddenBox: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
  webviewOverlayBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 56, backgroundColor: '#ffffff' },
  webviewFill: { flex: 1 },
  overlayBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    backgroundColor: '#0a6650',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  overlayText: { color: '#ffffff', fontSize: 13, flex: 1 },
  overlayBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  overlayBtnText: { color: '#ffffff', fontSize: 13 },
})
