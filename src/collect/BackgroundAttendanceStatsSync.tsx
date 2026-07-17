import { useEffect, useState } from 'react'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { useSync } from '../sync/SyncProvider'
import { subscribeForeground } from '../app/foregroundOrchestrator'
import { syncSession } from './syncSession'

// 起動直後の描画・掲示/LETUS同期と競合しないよう、少し待ってから開始する（掲示より後ろ）。
const START_DELAY_MS = 9000

/**
 * 出欠状況を起動時とフォアグラウンド復帰時に取りに行く薄いトリガ。
 * エンジンのマウント・完了処理は SyncProvider が単独所有し、ここはスケジューリングだけを担う
 * （BackgroundBulletinSync と同契約）。
 *
 * **「最低1日1回は更新されてほしい」への回答（ユーザー要望 2026-07-17）**:
 * このアプリに**バックグラウンド実行は無い**（expo-background-fetch/TaskManager の依存もコードも無い
 * ＝WebViewスクレイピング方式の必然）。したがって保証できるのは「**アプリを開いた日は必ず1回は取る**」
 * まで。開かない日は取得できない。これを満たすため:
 *   - 起動時（cold start）に1回
 *   - フォアグラウンド復帰時にも再評価（開きっぱなしで日をまたぐ端末を拾う）
 * いずれも鮮度TTL（6h・runner側で判定）を通すので、1日に取りに行くのは最大4回＝CLASS負荷は増えない
 * （[[litus-load-audit-2026-07-13]]「静かに運用」）。
 *
 * 授業中は出席WebViewがCLASSセッションを専有するため runner 側の decideClassSync が見送る。
 * 実測（2026-07-17・ユーザー報告）でも授業外なら取れている。見送られても TTL は消費しない
 * （鮮度時刻は収集成功時しか更新されない）ので、授業が終わった後の復帰で取り直せる。
 */
export default function BackgroundAttendanceStatsSync() {
  // フォアグラウンド復帰の再評価トリガー（授業終了後・TTL経過後に開始し直すため）。
  const [wakeTick, setWakeTick] = useState(0)
  // 授業時間帯（出席WebViewが稼働）はCLASSセッションを出席が専有する。running が下がれば再評価される。
  const { running } = useAttendanceEngine()
  const { runAttendanceStatsSync, attendanceStatsBusy } = useSync()

  useEffect(() => {
    if (syncSession.attendanceStatsSyncedThisBoot) return
    let cancelled = false
    const t = setTimeout(() => {
      if (cancelled || running) return
      // 鮮度TTL・アクセス可否・授業中判定はすべて runner が持つ（背景source＝無音スキップ）。
      // ここで TTL を判定して syncedThisBoot を立てないこと: 立てると復帰時の再評価が死に、
      // 「開きっぱなしで日をまたぐ」端末が永久に更新されなくなる。
      runAttendanceStatsSync({ source: wakeTick > 0 ? 'foreground' : 'boot' })
    }, START_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // attendanceStatsBusy を依存に含める: 走行中の再評価は runner の in-flight ガードが弾き、
    // 完走（busy下降）後にまだ未確定なら（＝途中破棄されていたら）再試行の機会になる。
  }, [running, wakeTick, runAttendanceStatsSync, attendanceStatsBusy])

  // フォアグラウンド復帰で再評価する。TTL内なら runner が無音で見送るため、ここは素直に叩いてよい。
  // （letusSync スロットと同じく最後発の枠に相乗りさせ、Auth再温め・出席再判定の後に来るようにする）
  useEffect(() => {
    return subscribeForeground('letusSync', () => {
      // 復帰のたびに once-per-boot を解除して再評価させる。実際に取りに行くかは runner の TTL 判定次第。
      syncSession.attendanceStatsSyncedThisBoot = false
      setWakeTick((t) => t + 1)
    })
  }, [])

  return null
}
