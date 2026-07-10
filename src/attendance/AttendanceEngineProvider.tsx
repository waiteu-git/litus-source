import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLoginGate } from '../auth/LoginGate'
import { useClassView } from '../collect/classViewArbiter'
import {
  CLASS_PC_LOGIN_URL,
  DESKTOP_UA,
  DETECT_ATTENDANCE_JS,
  DETECT_PAGE_JS,
  ENTER_CLASS_PC_JS,
  OPEN_ATTENDANCE_JS,
  buildSubmitAttendanceJs,
} from '../collect/injectedScripts'
import { parseAttendanceMessage, type AttendanceReception, type AttendanceStatus } from '../collect/attendanceMessage'
import { classifyClassPage } from './classifyClassPage'
import { isInClassPeriod, attendedClassEndMin } from './classPeriod'
import { isAttendedNow, mergeAttendedRecord, todayKey, type AttendedRecord } from './attendedState'
import { loadAttendedRecord, saveAttendedRecord } from '../storage/attendanceDoneStore'
import { normalizeAttendanceCode } from './normalizeCode'
import { loadTimetable } from '../storage/timetableStore'
import type { TimetableCollection } from '../collect/timetableMessage'
import {
  attendanceReducer,
  initialEngineState,
  type EnginePhase,
  type SubmitResult,
} from './engine'

const CLASS_URL = CLASS_PC_LOGIN_URL
// 出席状況の取得（メニュー遷移→受付判定）は約7秒・2トライで打ち切る（ユーザー指定）。
const NAV_TIMEOUT_MS = 7000
const ATTENDANCE_POLL_MS = 30000
// PC競合（他画面でCLASS使用中）のとき、諦めず静かに再試行する間隔。
const CONFLICT_RETRY_MS = 7000

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
export type AttendanceEngineValue = {
  phase: EnginePhase
  reception: AttendanceReception | null
  result: SubmitResult | null
  attended: AttendedRecord | null
  attendedNow: boolean
  now: Date
  code: string
  setCode: (s: string) => void
  submit: () => void
  retry: () => void
  /** WebViewが起動中か（バナー判定で reception を信頼してよいかの目安）。 */
  running: boolean
  /** PC等の他画面でCLASSを開いていて確認できない状態（複数画面競合）。UIは専用表示にする。 */
  conflict: boolean
  failCount: number
  revealClass: boolean
  setRevealClass: (b: boolean) => void
  timetable: TimetableCollection[]
  /** 出席画面のフォーカス状態を通知する（起動ポリシー＋収集への優先権制御）。 */
  setAttendanceFocused: (b: boolean) => void
}

const Ctx = createContext<AttendanceEngineValue | null>(null)

export function useAttendanceEngine(): AttendanceEngineValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAttendanceEngine must be used within AttendanceEngineProvider')
  return v
}

export function AttendanceEngineProvider({ children }: { children: ReactNode }) {
  const webviewRef = useRef<WebView>(null)
  const portalTriesRef = useRef(0)
  const errorRetryRef = useRef(0)
  const phaseRef = useRef<EnginePhase>('booting')
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loginGate = useLoginGate()
  const { collectActive, setAttendanceFocused: arbiterSetFocused } = useClassView()
  const collectActiveRef = useRef(false)
  collectActiveRef.current = collectActive
  const onAttendanceRef = useRef(false)
  const attendedRef = useRef(false)
  const attendedRecordRef = useRef<AttendedRecord | null>(null)
  const lastCodeRef = useRef('')

  const [state, dispatch] = useReducer(attendanceReducer, initialEngineState)
  const [code, setCode] = useState('')
  const [webviewKey, setWebviewKey] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [revealClass, setRevealClass] = useState(false)
  const [failCount, setFailCount] = useState(0)
  const [attended, setAttended] = useState<AttendedRecord | null>(null)
  const [timetable, setTimetable] = useState<TimetableCollection[]>([])
  const [attendanceFocused, setAttendanceFocusedState] = useState(false)
  const [conflict, setConflict] = useState(false)
  // ポーリング条件を最新の受付状態で判定するための ref（interval クロージャの stale 回避）。
  const receptionStatusRef = useRef<AttendanceStatus | undefined>(undefined)
  receptionStatusRef.current = state.reception?.status

  phaseRef.current = state.phase

  // 起動ポリシー: 授業時間帯 または 出席画面フォーカス中。停止中は WebView をアンマウント。
  const running = attendanceFocused || isInClassPeriod(timetable, now)
  const shouldRender = running && !collectActive
  const prevRenderRef = useRef(false)
  const shouldRenderRef = useRef(false)
  shouldRenderRef.current = shouldRender

  // shouldRender が false→true になったら WebView を作り直して最初から遷移（収集返却・授業入り・
  // 出席フォーカス取得のいずれでも同じ再起動）。reception はキャッシュ保持。
  useEffect(() => {
    if (shouldRender && !prevRenderRef.current) {
      portalTriesRef.current = 0
      errorRetryRef.current = 0
      dispatch({ kind: 'reboot' })
      setWebviewKey((k) => k + 1)
    }
    prevRenderRef.current = shouldRender
  }, [shouldRender])

  // 時間割を読み込む（起動ポリシー判定用）。前面復帰時も貼り直す。
  useEffect(() => {
    loadTimetable().then((t) => setTimetable(t ?? [])).catch(() => undefined)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') loadTimetable().then((t) => setTimetable(t ?? [])).catch(() => undefined)
    })
    return () => sub.remove()
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

  // フォアグラウンド復帰時に再判定/リフレッシュ。送信中はスキップ。
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || phaseRef.current === 'submitting' || !shouldRenderRef.current) return
      if (onAttendanceRef.current) refreshAttendance()
      else webviewRef.current?.injectJavaScript(DETECT_PAGE_JS)
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 出席ページ滞在中は定期的にサーバから受付状況を取り直す（開きっぱなしで授業が始まったら
  // 自動で「受付中」に切り替わるように）。収集使用中・送信中・出席済みは触らない。
  useEffect(() => {
    const id = setInterval(() => {
      // 受付状況の取り直しは「受付中(未提出)」のときだけ（出席済み/受付終了/受付なし/送信中/収集中/競合は無駄打ち）。
      if (
        receptionStatusRef.current === 'accepting' &&
        onAttendanceRef.current &&
        shouldRenderRef.current &&
        !collectActiveRef.current &&
        phaseRef.current !== 'submitting'
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

  // 「出席済み」記録の読み込み（起動時）。
  useEffect(() => {
    loadAttendedRecord().then(setAttended).catch(() => undefined)
  }, [])

  // PC競合中は諦めず、一定間隔でWebViewを作り直して再試行（PCを閉じたら正常ページに着地→自動復帰）。
  useEffect(() => {
    if (!conflict) return
    const id = setInterval(() => {
      if (!shouldRenderRef.current) return
      portalTriesRef.current = 0
      errorRetryRef.current = 0
      dispatch({ kind: 'reboot' })
      setWebviewKey((k) => k + 1)
    }, CONFLICT_RETRY_MS)
    return () => clearInterval(id)
  }, [conflict])

  function inject(js: string) {
    webviewRef.current?.injectJavaScript(js)
  }

  function armNavTimeout() {
    if (navTimerRef.current) clearTimeout(navTimerRef.current)
    navTimerRef.current = setTimeout(() => dispatch({ kind: 'navTimeout' }), NAV_TIMEOUT_MS)
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
        hasSystemError: !!parsed.hasSystemError,
        hasMultiScreen: !!parsed.hasMultiScreen,
        url: typeof parsed.url === 'string' ? parsed.url : undefined,
      })
      dispatch({ kind: 'page', page: kind })
      onAttendanceRef.current = kind === 'attendance'
      if (kind !== 'conflict') setConflict(false)
      if (kind === 'login') {
        loginGate.requireLogin()
      } else if (kind === 'conflict') {
        // PC等の他画面と競合。自動やり直しでは解けないので専用表示にし、navタイマーは止めて
        // navFailed へ落とさない。復帰は CONFLICT_RETRY_MS の再試行に任せる（PCを閉じたら回復）。
        if (navTimerRef.current) {
          clearTimeout(navTimerRef.current)
          navTimerRef.current = null
        }
        setConflict(true)
      } else if (kind === 'attendance') {
        portalTriesRef.current = 0
        errorRetryRef.current = 0
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
      console.log('[attendance nav]', data)
      return
    }
    if (parsed.type === 'attendance') {
      const rec = parseAttendanceMessage(data)
      dispatch({ kind: 'reception', reception: rec })
      // CLASSが「出席済み」を示したら、どのデバイスで出していても記録を更新（授業間の継続表示・
      // オフライン補助）。CLASSの状態が正。
      if (rec.status === 'attended') {
        const d = new Date()
        // 再アクセス/別デバイス出席では lastCodeRef が空。既存の同日記録のコードを引き継いで消さない。
        const arec = mergeAttendedRecord(attendedRecordRef.current, {
          date: todayKey(d),
          courseName: rec.courseName ?? '',
          confirmWindow: rec.confirmWindow ?? null,
          code: lastCodeRef.current,
        })
        setAttended(arec)
        saveAttendedRecord(arec).catch(() => undefined)
      }
      return
    }
    if (parsed.type === 'submit') {
      const result: SubmitResult = {
        result: typeof parsed.result === 'string' ? parsed.result : '送信しました',
        ok: !!parsed.ok,
        wrong: !!parsed.wrong,
        err: !!parsed.err,
      }
      dispatch({ kind: 'submitResult', result })
      if (result.ok) {
        const d = new Date()
        const rec = mergeAttendedRecord(attendedRecordRef.current, {
          date: todayKey(d),
          courseName: state.reception?.courseName ?? '',
          confirmWindow: state.reception?.confirmWindow ?? null,
          code: lastCodeRef.current,
        })
        setAttended(rec)
        saveAttendedRecord(rec).catch(() => undefined)
      }
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
    dispatch({ kind: 'submitStart' })
    inject(buildSubmitAttendanceJs(c))
  }

  function retry() {
    setCode('')
    portalTriesRef.current = 0
    errorRetryRef.current = 0
    setRevealClass(false)
    dispatch({ kind: 'retry' })
    setWebviewKey((k) => k + 1)
  }

  const setAttendanceFocused = useCallback((b: boolean) => setAttendanceFocusedState(b), [])

  // CLASSが出席済みを示していれば最優先。無ければローカル記録（授業間の継続表示・オフライン補助）。
  // 受付が授業より早く閉じても、出席済み表示は当該授業の時限終了まで延長する（次の授業が始まれば切れる）。
  const classEndMin = attendedClassEndMin(timetable, now, attended?.confirmWindow ?? null)
  const attendedNow = state.reception?.status === 'attended' || isAttendedNow(attended, now, classEndMin)
  attendedRef.current = attendedNow
  attendedRecordRef.current = attended

  const value: AttendanceEngineValue = {
    phase: state.phase,
    reception: state.reception,
    result: state.result,
    attended,
    attendedNow,
    now,
    code,
    setCode,
    submit,
    retry,
    running,
    conflict,
    failCount,
    revealClass,
    setRevealClass,
    timetable,
    setAttendanceFocused,
  }

  return (
    <Ctx.Provider value={value}>
      {children}
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
