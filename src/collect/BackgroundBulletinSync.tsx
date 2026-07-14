import { useEffect } from 'react'
import { isBulletinStale, loadBulletinRefreshedAt } from '../storage/refreshMetaStore'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { useSync } from '../sync/SyncProvider'

// 起動直後の描画やLETUS同期と競合しないよう、少し待ってから開始する。
const START_DELAY_MS = 6000

// この起動で掲示収集を実施/確定したか（プロセス内フラグ・永続化しない）。
const session = { done: false }

/**
 * 起動時に一度だけCLASS掲示の同期を発火する薄いトリガ。収集エンジンのマウント・完了処理は
 * SyncProvider が単独所有し、ここはスケジューリング（起動遅延・鮮度TTL・once-per-boot）だけを担う。
 * アクセス可否（オフライン/メンテ帯/授業中）は runner 側の planSync が判定する（背景source＝無音スキップ）。
 * runner が開始できなかった場合は session.done を立てず、授業終了（running 下降）で再試行する。
 */
export default function BackgroundBulletinSync() {
  // 授業時間帯(running=出席WebViewが稼働)はCLASSセッションを出席が専有するため、掲示収集を控える
  // （同一セッションの奪い合いで空ページ＝出席まで不安定化する）。running が下がれば再試行される。
  const { running } = useAttendanceEngine()
  const { runBulletinSync } = useSync()

  useEffect(() => {
    if (session.done) return
    let cancelled = false
    const t = setTimeout(() => {
      if (cancelled || running) return
      loadBulletinRefreshedAt()
        .then((at) => {
          if (cancelled || session.done) return
          if (!isBulletinStale(at)) {
            session.done = true
            return
          }
          if (runBulletinSync({ source: 'boot' })) session.done = true
        })
        .catch(() => {
          if (!cancelled && !session.done && runBulletinSync({ source: 'boot' })) session.done = true
        })
    }, START_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [running, runBulletinSync])

  return null
}
