import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import BulletinSyncEngine from '../collect/BulletinSyncEngine'
import LetusSyncEngine from '../collect/LetusSyncEngine'
import { useKillSwitch } from '../health/KillSwitchProvider'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { useClassView } from '../collect/classViewArbiter'
import { planSync } from './syncGuards'
import { decideClassSync } from './classSyncConfirm'
import { evaluateAccess } from '../health/accessGate'
import { isOnlineNow } from '../health/connectivity'
import { loadAssignmentsRefreshedAt, loadBulletinRefreshedAt } from '../storage/refreshMetaStore'
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
  /** 掲示/課題の最終成功時刻（保存値の反映。0=未収集）。 */
  lastBulletinAt: number
  lastAssignmentsAt: number
  /** 両者の合成（古い方＝全データの保証時刻）。両方未収集なら null。 */
  lastSyncAt: number | null
  /** 直近のスキップ理由（source==='user' のときだけ設定・数秒で自動クリア）。 */
  skip: SyncSkip | null
  bulletinHealth: StoredHealth | null
  letusHealth: StoredHealth | null
  /** 掲示→課題の順で同期（ホーム上部ボタン）。結果を返す（'confirm-attending'＝授業中の確認要求）。 */
  runFullSync: (opts?: RunOpts) => SyncStartResult
  /** 掲示のみ（背景boot用・確認override可）。 */
  runBulletinSync: (opts?: RunOpts) => SyncStartResult
  /** 課題のみ（課題画面の更新・背景boot/foreground用）。 */
  runAssignmentsSync: (opts?: RunOpts) => SyncStartResult
}

// Provider外（テスト等）は不活性: 何もせず・何も走らせない。
const Ctx = createContext<SyncValue>({
  bulletinBusy: false,
  bulletinUserRun: false,
  assignmentBusy: false,
  lastBulletinAt: 0,
  lastAssignmentsAt: 0,
  lastSyncAt: null,
  skip: null,
  bulletinHealth: null,
  letusHealth: null,
  runFullSync: () => 'skipped',
  runBulletinSync: () => 'skipped',
  runAssignmentsSync: () => 'skipped',
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

  const [bulletinBusy, setBulletinBusy] = useState(false)
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const bulletinBusyRef = useRef(false)
  const assignmentBusyRef = useRef(false)
  // 掲示完了後に課題フェーズを連鎖するか（runFullSync のときだけ true）と、その発火元。
  const chainRef = useRef<SyncSource | null>(null)

  const [assignmentProgress, setAssignmentProgress] = useState<string | null>(null)
  const [bulletinUserRun, setBulletinUserRun] = useState(false)
  const [lastBulletinAt, setLastBulletinAt] = useState(0)
  const [lastAssignmentsAt, setLastAssignmentsAt] = useState(0)
  const [bulletinHealth, setBulletinHealth] = useState<StoredHealth | null>(null)
  const [letusHealth, setLetusHealth] = useState<StoredHealth | null>(null)

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
    loadCollectionHealth()
      .then((m) => {
        setBulletinHealth(m.bulletin ?? null)
        setLetusHealth(m.letusAssignments ?? null)
      })
      .catch(() => undefined)
  }, [])

  const runBulletinSync = useCallback(
    (opts?: RunOpts): SyncStartResult => {
      const source = opts?.source ?? 'user'
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

  const runAssignmentsSync = useCallback(
    (opts?: RunOpts): SyncStartResult => {
      const source = opts?.source ?? 'user'
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
      // 掲示が走れない（kill/メンテ/授業中/オフライン/確認待ち）なら課題だけ試す
      // （授業中でもLETUSは同期可）。掲示が授業中の確認待ちなら、その旨を呼び出し側へ返す。
      const assignments = runAssignmentsSync({ source })
      if (bulletin === 'confirm-attending') return 'confirm-attending'
      return assignments
    },
    [runBulletinSync, runAssignmentsSync],
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
    chainRef.current = null
    if (chained) {
      // 課題フェーズへ連鎖（可否は改めて planSync 判定。ホーム側の演出は掲示完了時点で格納済み）。
      runAssignmentsSync({ source: chained })
    }
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
      lastBulletinAt,
      lastAssignmentsAt,
      lastSyncAt,
      skip,
      bulletinHealth,
      letusHealth,
      runFullSync,
      runBulletinSync,
      runAssignmentsSync,
    }),
    [
      bulletinBusy,
      bulletinUserRun,
      assignmentBusy,
      lastBulletinAt,
      lastAssignmentsAt,
      lastSyncAt,
      skip,
      bulletinHealth,
      letusHealth,
      runFullSync,
      runBulletinSync,
      runAssignmentsSync,
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
        {assignmentBusy ? (
          <LetusSyncEngine onProgress={(label) => setAssignmentProgress(label)} onFinished={onAssignmentsFinished} />
        ) : null}
      </ProgressCtx.Provider>
    </Ctx.Provider>
  )
}
