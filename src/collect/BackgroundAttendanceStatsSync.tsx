import { useEffect, useState } from 'react'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { useSync } from '../sync/SyncProvider'
import { subscribeForeground } from '../app/foregroundOrchestrator'
import { syncSession } from './syncSession'
import { shouldAttemptAttendanceStats } from './attendanceStatsRetry'

// 起動直後の描画・掲示/LETUS同期と競合しないよう、少し待ってから最初の試行を立てる（掲示より後ろ）。
const START_DELAY_MS = 9000
// 「再試行してよい時刻か」を確認する tick 間隔。実際の再試行間隔（12分）は shouldAttemptAttendanceStats
// が判定するので、この tick はそれより細かくてよい（tick を進めるだけ＝収集はしない軽い処理）。
const RECHECK_INTERVAL_MS = 60 * 1000

/**
 * 出欠状況を起動時・フォアグラウンド復帰時・**失敗後の再試行**として取りに行く薄いトリガ。
 * エンジンのマウント・完了処理は SyncProvider が単独所有し、ここはスケジューリングだけを担う。
 *
 * **v97 の不具合（2026-07-18修正・多角レビューで反証通過）**: 以前は once-per-boot フラグ1つでゲート
 * しており、そのフラグが収集の**失敗でも立って**いた。起動直後の取得が 0 件で終わると、フォアグラウンド
 * 復帰までフラグが下りず、アプリを開きっぱなしの端末では**二度と自動取得しなかった**（ユーザー報告
 * 「一度取得できないとずっと取得できない」）。修正後は成功時のみ once-per-boot を確定し、失敗は
 * 間隔（12分）を空けて最大回数（5回）まで自動再試行する。可否は shouldAttemptAttendanceStats（純粋・
 * テスト済み）が決める。
 *
 * バックグラウンド実行は無い（WebViewスクレイピングの必然）ので、保証は「アプリを開いている間に
 * 取りに行く」まで。鮮度TTL（6h・runner側）と再試行の上限で CLASS 負荷は抑える
 * （[[litus-load-audit-2026-07-13]]「静かに運用」）。授業中は runner の decideClassSync が見送る。
 */
export default function BackgroundAttendanceStatsSync() {
  // 再評価トリガー（初回遅延・定期リチェック・フォアグラウンド復帰で進める）。
  const [tick, setTick] = useState(0)
  // 授業時間帯（出席WebViewが稼働）はCLASSセッションを出席が専有する。running が下がれば再評価される。
  const { running } = useAttendanceEngine()
  const { runAttendanceStatsSync, attendanceStatsBusy } = useSync()

  // 起動直後に最初の tick を遅延で立てる（描画・他同期との競合回避）。
  useEffect(() => {
    const t = setTimeout(() => setTick((n) => n + 1), START_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  // 失敗が残っている間は定期的に再評価する（前面滞在中でも回復の機会を与える）。
  // 成功して once-per-boot が確定すれば shouldAttempt が false を返し実収集は走らない
  // （runner の鮮度TTLと二重の歯止め）。tick を進めるだけの軽い処理。
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), RECHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (running) return // 授業中は出席がCLASSを専有。running 下降で再評価される。
    if (attendanceStatsBusy) return // 収集中は二重起動しない（runner の in-flight ガードと二重歯止め）。
    const attempt = shouldAttemptAttendanceStats({
      succeededThisBoot: syncSession.attendanceStatsSyncedThisBoot,
      attempts: syncSession.attendanceStatsAttempts,
      lastAttemptAt: syncSession.attendanceStatsLastAttemptAt,
      lifetimeAttempts: syncSession.attendanceStatsLifetimeAttempts,
      now: Date.now(),
    })
    if (!attempt) return
    // 初回は boot、再試行・復帰後は foreground（鮮度TTLの扱いは同じ＝背景source）。
    runAttendanceStatsSync({ source: syncSession.attendanceStatsAttempts === 0 ? 'boot' : 'foreground' })
  }, [tick, running, attendanceStatsBusy, runAttendanceStatsSync])

  // フォアグラウンド復帰は「取り直してよい」強いシグナル。試行カウントをリセットし、失敗打ち切り
  // （最大回数）も解除して再評価する（授業終了後・長時間経過後に取り直す）。
  // 成功済みフラグは触らない: 成功していれば鮮度TTL（6h）が二重取得を防ぐ。未成功なら次の tick で試す。
  // attendanceStatsLifetimeAttempts は**リセットしない**: 復帰で解除される per-boot 上限とは別建ての
  // プロセス寿命の負荷天井で、病的な連続出し入れ（復帰のたびにスロットルが開く）を有界化するため。
  useEffect(() => {
    return subscribeForeground('letusSync', () => {
      syncSession.attendanceStatsAttempts = 0
      syncSession.attendanceStatsLastAttemptAt = null
      setTick((n) => n + 1)
    })
  }, [])

  return null
}
