import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import BulletinSyncEngine from '../collect/BulletinSyncEngine'
import LetusSyncEngine from '../collect/LetusSyncEngine'
import AttendanceStatsSyncEngine from '../collect/AttendanceStatsSyncEngine'
import { useKillSwitch } from '../health/KillSwitchProvider'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { useClassView } from '../collect/classViewArbiter'
import { useDemo } from '../demo/DemoProvider'
import { planSync } from './syncGuards'
import { decideClassSync } from './classSyncConfirm'
import { evaluateAccess } from '../health/accessGate'
import { isOnlineNow } from '../health/connectivity'
import {
  isAttendanceStatsStale,
  loadAssignmentsRefreshedAt,
  loadAttendanceStatsRefreshedAt,
  loadBulletinRefreshedAt,
} from '../storage/refreshMetaStore'
import { loadCollectionHealth } from '../storage/collectionHealthStore'
import type { StoredHealth } from '../storage/collectionHealthSerialize'
import type { SyncSkipReason } from '../health/syncSkipNotice'
import { combinedLastSync } from '../health/syncAgo'
import { syncSession } from '../collect/syncSession'

export type SyncSource = 'user' | 'boot' | 'foreground'
export type SyncSkip = { feature: 'class' | 'letus'; reason: SyncSkipReason }

type RunOpts = { source?: SyncSource; overrideAttending?: boolean }

/**
 * 同期開始の結果。'confirm-attending' は「授業中・出席タブ非表示でCLASS同期を保留した＝確認すれば
 * override で回せる」。呼び出し側（useClassSyncConfirm）が確認ダイアログを出す。
 */
export type SyncStartResult = 'started' | 'busy' | 'skipped' | 'confirm-attending'

export type SyncValue = {
  /** 掲示エンジン稼働中（手動・背景を問わない）。 */
  bulletinBusy: boolean
  /** 稼働中の掲示同期がユーザー起点か（ホームの同期アニメはユーザー起点のみ演出＝背景bootで勝手に動かない）。 */
  bulletinUserRun: boolean
  /** LETUS課題フル同期エンジン稼働中（手動・背景を問わない）。 */
  assignmentBusy: boolean
  /** 出欠状況（CLASS「学生出欠状況確認」）収集エンジン稼働中。 */
  attendanceStatsBusy: boolean
  /** 掲示/課題の最終成功時刻（保存値の反映。0=未収集）。 */
  lastBulletinAt: number
  lastAssignmentsAt: number
  /** 出欠の最終成功時刻（0=未収集）。 */
  lastAttendanceStatsAt: number
  /** 両者の合成（古い方＝全データの保証時刻）。両方未収集なら null。 */
  lastSyncAt: number | null
  /** 直近のスキップ理由（source==='user' のときだけ設定・数秒で自動クリア）。 */
  skip: SyncSkip | null
  bulletinHealth: StoredHealth | null
  letusHealth: StoredHealth | null
  attendanceStatsHealth: StoredHealth | null
  /** 掲示→出欠→課題の順で同期（ホーム上部ボタン）。結果を返す（'confirm-attending'＝授業中の確認要求）。 */
  runFullSync: (opts?: RunOpts) => SyncStartResult
  /** 掲示のみ（背景boot用・確認override可）。 */
  runBulletinSync: (opts?: RunOpts) => SyncStartResult
  /** 課題のみ（課題画面の更新・背景boot/foreground用）。 */
  runAssignmentsSync: (opts?: RunOpts) => SyncStartResult
  /**
   * 出欠のみ（時間割同期の完走後・背景boot用）。CLASS収集なので可否は掲示と同じ decideClassSync。
   * source!=='user' のときだけ鮮度TTL（6h）でスキップする（ユーザー起点は常に取りに行く）。
   */
  runAttendanceStatsSync: (opts?: RunOpts) => SyncStartResult
}

// Provider外（テスト等）は不活性: 何もせず・何も走らせない。
const Ctx = createContext<SyncValue>({
  bulletinBusy: false,
  bulletinUserRun: false,
  assignmentBusy: false,
  attendanceStatsBusy: false,
  lastBulletinAt: 0,
  lastAssignmentsAt: 0,
  lastAttendanceStatsAt: 0,
  lastSyncAt: null,
  skip: null,
  bulletinHealth: null,
  letusHealth: null,
  attendanceStatsHealth: null,
  runFullSync: () => 'skipped',
  runBulletinSync: () => 'skipped',
  runAssignmentsSync: () => 'skipped',
  runAttendanceStatsSync: () => 'skipped',
})

// 課題同期の進捗ラベル（1ページ巡回ごとに更新される高頻度値）。本体contextから分離し、
// 表示する消費者（課題画面の更新バー）だけが毎ページ再レンダーされるようにする（NowCtxと同型）。
const ProgressCtx = createContext<string | null>(null)

export function useSync(): SyncValue {
  return useContext(Ctx)
}

/** 課題同期の進捗ラベル（エンジンのステージ文言・件数入り）。表示する部品だけが購読する。 */
export function useSyncProgress(): string | null {
  return useContext(ProgressCtx)
}

const SKIP_NOTICE_MS = 5000

/**
 * 同期のオーケストレーションを単独所有する Provider。掲示（BulletinSyncEngine）と課題フル同期
 * （LetusSyncEngine）のマウント・完了処理・in-flight ガードをここに集約し、手動（ホーム上部ボタン・
 * 課題画面の更新）も背景（boot/foreground）も同じ runner を通す＝二重マウント競合を構造的に防ぐ。
 * runFullSync は掲示→課題の順次実行: 掲示完了で bulletinBusy が落ち（ホームの同期アニメが格納され）、
 * 続けて課題フェーズが走る（ホームは無演出・課題画面は進捗バーを完了まで表示）。
 * 実行可否は planSync（オフライン/メンテ帯/授業中）で判定し、ユーザー起点のスキップだけ理由を提示する。
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { running } = useAttendanceEngine()
  const runningRef = useRef(running)
  runningRef.current = running
  // 出席タブが前面か（授業中の確認override判定に使う。前面なら据え置き＝出席画面を壊さない）。
  const { attendanceFocused } = useClassView()
  const attendanceFocusedRef = useRef(attendanceFocused)
  attendanceFocusedRef.current = attendanceFocused
  const { status: killStatus, isKilled } = useKillSwitch()
  const isKilledRef = useRef(isKilled)
  isKilledRef.current = isKilled
  // デモ中は収集を一切走らせない。runner は useCallback で固定されるため ref 経由で読む。
  const { active: demo } = useDemo()
  const demoRef = useRef(false)
  demoRef.current = demo

  const [bulletinBusy, setBulletinBusy] = useState(false)
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const [attendanceStatsBusy, setAttendanceStatsBusy] = useState(false)
  const bulletinBusyRef = useRef(false)
  const assignmentBusyRef = useRef(false)
  const attendanceStatsBusyRef = useRef(false)
  // フル同期の残りフェーズを連鎖するか（runFullSync のときだけ立つ）と、その発火元。
  // 連鎖は 掲示 → 出欠 → 課題。CLASS収集どうし（掲示・出欠）は classCollectLease で直列化される。
  const chainRef = useRef<SyncSource | null>(null)

  const [assignmentProgress, setAssignmentProgress] = useState<string | null>(null)
  const [bulletinUserRun, setBulletinUserRun] = useState(false)
  const [lastBulletinAt, setLastBulletinAt] = useState(0)
  const [lastAssignmentsAt, setLastAssignmentsAt] = useState(0)
  const [lastAttendanceStatsAt, setLastAttendanceStatsAt] = useState(0)
  const lastAttendanceStatsAtRef = useRef(0)
  lastAttendanceStatsAtRef.current = lastAttendanceStatsAt
  const [bulletinHealth, setBulletinHealth] = useState<StoredHealth | null>(null)
  const [letusHealth, setLetusHealth] = useState<StoredHealth | null>(null)
  const [attendanceStatsHealth, setAttendanceStatsHealth] = useState<StoredHealth | null>(null)

  const [skip, setSkip] = useState<SyncSkip | null>(null)
  const skipRef = useRef<SyncSkip | null>(null)
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSkip = useCallback((next: SyncSkip) => {
    skipRef.current = next
    setSkip(next)
    if (skipTimer.current) clearTimeout(skipTimer.current)
    skipTimer.current = setTimeout(() => {
      skipRef.current = null
      setSkip(null)
    }, SKIP_NOTICE_MS)
  }, [])
  // feature単位で消す: runFullSync が掲示スキップ（授業中/CLASSメンテ）→課題フェーズへ落ちたとき、
  // 課題側の開始が直前に出した掲示側の理由表示を同一tickで握りつぶさないため。
  const clearSkip = useCallback((feature: 'class' | 'letus') => {
    if (skipRef.current == null || skipRef.current.feature !== feature) return
    if (skipTimer.current) clearTimeout(skipTimer.current)
    skipRef.current = null
    setSkip(null)
  }, [])
  useEffect(
    () => () => {
      if (skipTimer.current) clearTimeout(skipTimer.current)
    },
    [],
  )

  // 起動時に保存済みの鮮度・ヘルスを読み込む（初回セットアップ同期の結果もここで反映される）。
  useEffect(() => {
    loadBulletinRefreshedAt().then(setLastBulletinAt).catch(() => undefined)
    loadAssignmentsRefreshedAt().then(setLastAssignmentsAt).catch(() => undefined)
    loadAttendanceStatsRefreshedAt().then(setLastAttendanceStatsAt).catch(() => undefined)
    loadCollectionHealth()
      .then((m) => {
        setBulletinHealth(m.bulletin ?? null)
        setLetusHealth(m.letusAssignments ?? null)
        setAttendanceStatsHealth(m.attendanceStats ?? null)
      })
      .catch(() => undefined)
  }, [])

  const runBulletinSync = useCallback(
    (opts?: RunOpts): SyncStartResult => {
      const source = opts?.source ?? 'user'
      // デモ中は収集エンジンを起動しない（WebViewを作らせない＝通信ゼロ）。
      if (demoRef.current) return 'skipped'
      if (bulletinBusyRef.current) return 'busy'
      if (isKilledRef.current('bulletin')) {
        // 停止中の無反応化を防ぐ（ユーザー起点のみ理由を提示。背景は無音）。
        if (source === 'user') showSkip({ feature: 'class', reason: 'stopped' })
        return 'skipped'
      }
      const decision = decideClassSync({
        access: evaluateAccess('class', { now: new Date(), isOnline: isOnlineNow() }),
        running: runningRef.current,
        attendanceFocused: attendanceFocusedRef.current,
        override: opts?.overrideAttending ?? false,
      })
      if (decision.kind === 'confirm') {
        // 授業中・出席タブ非表示＝確認すれば override で回せる。ここでは開始せず呼び出し側に委ねる。
        return 'confirm-attending'
      }
      if (decision.kind === 'blocked') {
        if (source === 'user') showSkip({ feature: 'class', reason: decision.reason })
        return 'skipped'
      }
      clearSkip('class')
      bulletinBusyRef.current = true
      setBulletinUserRun(source === 'user')
      setBulletinBusy(true)
      return 'started'
    },
    [showSkip, clearSkip],
  )

  /**
   * 出欠状況（CLASS）収集。従来は TimetableScreen が「時間割同期の完走時」だけマウントしており、
   * ホームの同期チップ・初回ログインからは**構造上一度も起動しなかった**（ユーザー報告の①②は同じ根）。
   * 所有権を Provider へ移し、掲示と同じ可否判定・同じ場所で回す。
   */
  const runAttendanceStatsSync = useCallback(
    (opts?: RunOpts): SyncStartResult => {
      const source = opts?.source ?? 'user'
      // デモ中は収集エンジンを起動しない（WebViewを作らせない＝通信ゼロ）。
      if (demoRef.current) return 'skipped'
      if (attendanceStatsBusyRef.current) return 'busy'
      // 出欠は掲示と同じCLASS収集なので、掲示の停止スイッチに追従する（出欠専用のkillキーは無い）。
      if (isKilledRef.current('bulletin')) {
        if (source === 'user') showSkip({ feature: 'class', reason: 'stopped' })
        return 'skipped'
      }
      // 背景トリガだけ鮮度TTLで見送る（CLASS負荷を増やさない）。ユーザー起点は常に取りに行く
      // ＝「同期したのに出欠が古いまま」を作らない。
      if (source !== 'user' && !isAttendanceStatsStale(lastAttendanceStatsAtRef.current)) {
        return 'skipped'
      }
      const decision = decideClassSync({
        access: evaluateAccess('class', { now: new Date(), isOnline: isOnlineNow() }),
        running: runningRef.current,
        attendanceFocused: attendanceFocusedRef.current,
        override: opts?.overrideAttending ?? false,
      })
      if (decision.kind === 'confirm') return 'confirm-attending'
      if (decision.kind === 'blocked') {
        if (source === 'user') showSkip({ feature: 'class', reason: decision.reason })
        return 'skipped'
      }
      clearSkip('class')
      // 背景トリガの試行だけ記録する（再試行の間隔・最大回数の判定材料）。手動(user)は常に走らせたい
      // ので数えない。成功時に onAttendanceStatsFinished が attempts を 0 へ戻す。
      // lifetimeAttempts は復帰でも成功でも戻さない負荷天井なので、成否に依らずここで積み上げる。
      if (source !== 'user') {
        syncSession.attendanceStatsAttempts += 1
        syncSession.attendanceStatsLastAttemptAt = Date.now()
        syncSession.attendanceStatsLifetimeAttempts += 1
      }
      attendanceStatsBusyRef.current = true
      setAttendanceStatsBusy(true)
      return 'started'
    },
    [showSkip, clearSkip],
  )

  const runAssignmentsSync = useCallback(
    (opts?: RunOpts): SyncStartResult => {
      const source = opts?.source ?? 'user'
      // デモ中は収集エンジンを起動しない（WebViewを作らせない＝通信ゼロ）。
      if (demoRef.current) return 'skipped'
      if (assignmentBusyRef.current) return 'busy'
      if (isKilledRef.current('letus')) {
        if (source === 'user') showSkip({ feature: 'letus', reason: 'stopped' })
        return 'skipped'
      }
      const plan = planSync({ now: new Date(), isOnline: isOnlineNow(), running: runningRef.current })
      if (plan.letus !== 'run') {
        if (source === 'user') showSkip({ feature: 'letus', reason: plan.letus })
        return 'skipped'
      }
      clearSkip('letus')
      assignmentBusyRef.current = true
      setAssignmentProgress(null)
      setAssignmentBusy(true)
      return 'started'
    },
    [showSkip, clearSkip],
  )

  const runFullSync = useCallback(
    (opts?: RunOpts): SyncStartResult => {
      const source = opts?.source ?? 'user'
      // 掲示稼働中のみ二重開始を拒否する。課題（背景フル同期）稼働中でも掲示フェーズは開始できる
      // （CLASS/LETUSは別セッションで独立。課題フェーズの二重開始は runAssignmentsSync 側の
      //  in-flight ガードが弾き、完了時の連鎖も同ガードで無害に no-op する）。
      if (bulletinBusyRef.current) return 'busy'
      const bulletin = runBulletinSync({ source, overrideAttending: opts?.overrideAttending })
      if (bulletin === 'started') {
        chainRef.current = source
        return 'started'
      }
      // 掲示が走れない（kill/メンテ/授業中/オフライン/確認待ち）なら、まず出欠を試す。
      // 掲示だけが停止中（kill）でも出欠は取れるため、ここで諦めずCLASSフェーズを使い切る。
      const stats = runAttendanceStatsSync({ source, overrideAttending: opts?.overrideAttending })
      if (stats === 'started') {
        chainRef.current = source
        return 'started'
      }
      // CLASSがどちらも走れないなら課題だけ試す（授業中でもLETUSは同期可）。
      // 掲示が授業中の確認待ちなら、その旨を呼び出し側へ返す。
      const assignments = runAssignmentsSync({ source })
      if (bulletin === 'confirm-attending') return 'confirm-attending'
      return assignments
    },
    [runBulletinSync, runAssignmentsSync, runAttendanceStatsSync],
  )

  const onBulletinFinished = useCallback(() => {
    bulletinBusyRef.current = false
    setBulletinBusy(false)
    setBulletinUserRun(false)
    // once-per-boot の掲示同期は**完走**で確定する（開始時に立てると途中破棄で空費する）。
    syncSession.bulletinSyncedThisBoot = true
    loadBulletinRefreshedAt().then(setLastBulletinAt).catch(() => undefined)
    loadCollectionHealth().then((m) => setBulletinHealth(m.bulletin ?? null)).catch(() => undefined)
    const chained = chainRef.current
    if (chained) {
      // CLASSフェーズ2: 出欠。走れば onAttendanceStatsFinished が課題へ連鎖する。
      // 走れない（鮮度内/授業中/停止）なら**ここで課題へ飛ばす**＝連鎖を途切れさせない。
      if (runAttendanceStatsSync({ source: chained }) === 'started') return
      chainRef.current = null
      runAssignmentsSync({ source: chained })
    }
  }, [runAssignmentsSync, runAttendanceStatsSync])

  const onAttendanceStatsFinished = useCallback((succeeded: boolean) => {
    attendanceStatsBusyRef.current = false
    setAttendanceStatsBusy(false)
    // once-per-boot は**成功したときだけ**確定する。v97 では成否問わず立てていたため、起動直後の
    // 背景取得が 0 件で終わると、開きっぱなしの端末では二度と自動取得しなかった（2026-07-18修正）。
    // 失敗はここで syncSession を触らない＝shouldAttemptAttendanceStats が間隔を空けて再試行する。
    // attendanceStatsLifetimeAttempts は成功でも**リセットしない**（成否に依らず効かせる負荷天井）。
    if (succeeded) {
      syncSession.attendanceStatsSyncedThisBoot = true
      syncSession.attendanceStatsAttempts = 0
    }
    loadAttendanceStatsRefreshedAt().then(setLastAttendanceStatsAt).catch(() => undefined)
    loadCollectionHealth()
      .then((m) => setAttendanceStatsHealth(m.attendanceStats ?? null))
      .catch(() => undefined)
    // 単独起動（時間割同期の完走後・背景boot）では chainRef が null＝ここで終わる。
    const chained = chainRef.current
    chainRef.current = null
    if (chained) runAssignmentsSync({ source: chained })
  }, [runAssignmentsSync])

  const onAssignmentsFinished = useCallback(() => {
    assignmentBusyRef.current = false
    setAssignmentBusy(false)
    setAssignmentProgress(null)
    // フル同期完走の記録（BackgroundLetusSync の30分再同期判定と共有）。手動完走も同じ扱い。
    syncSession.didFullSync = true
    syncSession.lastFullSyncAt = Date.now()
    loadAssignmentsRefreshedAt().then(setLastAssignmentsAt).catch(() => undefined)
    loadCollectionHealth().then((m) => setLetusHealth(m.letusAssignments ?? null)).catch(() => undefined)
  }, [])

  // 稼働中にkill switchが入った場合はエンジンを即降ろす（busyが固着しないよう完了処理も走らせる。
  // didFullSyncは立てない＝再開後に背景同期が再評価する）。
  useEffect(() => {
    if (isKilled('bulletin') && bulletinBusyRef.current) {
      chainRef.current = null
      bulletinBusyRef.current = false
      setBulletinBusy(false)
      setBulletinUserRun(false)
    }
    // 出欠は掲示のkillキーに追従する（同じCLASS収集）。
    if (isKilled('bulletin') && attendanceStatsBusyRef.current) {
      chainRef.current = null
      attendanceStatsBusyRef.current = false
      setAttendanceStatsBusy(false)
    }
    if (isKilled('letus') && assignmentBusyRef.current) {
      assignmentBusyRef.current = false
      setAssignmentBusy(false)
      setAssignmentProgress(null)
    }
  }, [killStatus, isKilled])

  const lastSyncAt = combinedLastSync(lastBulletinAt, lastAssignmentsAt)

  const value = useMemo<SyncValue>(
    () => ({
      bulletinBusy,
      bulletinUserRun,
      assignmentBusy,
      attendanceStatsBusy,
      lastBulletinAt,
      lastAssignmentsAt,
      lastAttendanceStatsAt,
      lastSyncAt,
      skip,
      bulletinHealth,
      letusHealth,
      attendanceStatsHealth,
      runFullSync,
      runBulletinSync,
      runAssignmentsSync,
      runAttendanceStatsSync,
    }),
    [
      bulletinBusy,
      bulletinUserRun,
      assignmentBusy,
      attendanceStatsBusy,
      lastBulletinAt,
      lastAssignmentsAt,
      lastAttendanceStatsAt,
      lastSyncAt,
      skip,
      bulletinHealth,
      letusHealth,
      attendanceStatsHealth,
      runFullSync,
      runBulletinSync,
      runAssignmentsSync,
      runAttendanceStatsSync,
    ],
  )

  return (
    <Ctx.Provider value={value}>
      {/* 進捗ラベルは高頻度更新（1ページ巡回ごと）のため本体contextから分離（NowCtxと同型）。 */}
      <ProgressCtx.Provider value={assignmentProgress}>
        {children}
        {/* エンジンは Provider が唯一のマウント元（画面・背景コンポーネントは runner を呼ぶだけ）。
            kill switch は runner の事前チェック＋上の即時降ろし effect で反映する（Gateで包むと
            稼働中の停止で onFinished が来ず busy が固着するため使わない）。 */}
        {bulletinBusy ? <BulletinSyncEngine onFinished={onBulletinFinished} /> : null}
        {/* 出欠も Provider が単独所有する。以前は TimetableScreen がマウントしており、
            時間割同期の完走時しか起動しなかった＝ホーム同期・初回ログインでは構造上取れなかった。
            二重マウント厳禁（CLASS収集が二重に走る）。 */}
        {attendanceStatsBusy ? <AttendanceStatsSyncEngine onFinished={onAttendanceStatsFinished} /> : null}
        {assignmentBusy ? (
          <LetusSyncEngine onProgress={(label) => setAssignmentProgress(label)} onFinished={onAssignmentsFinished} />
        ) : null}
      </ProgressCtx.Provider>
    </Ctx.Provider>
  )
}
