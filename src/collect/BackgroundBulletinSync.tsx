import { useEffect } from 'react'
import { isBulletinStale, loadBulletinRefreshedAt } from '../storage/refreshMetaStore'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { useSync } from '../sync/SyncProvider'
import { syncSession } from './syncSession'

// 起動直後の描画やLETUS同期と競合しないよう、少し待ってから開始する。
const START_DELAY_MS = 6000

/**
 * 起動時に一度だけCLASS掲示の同期を発火する薄いトリガ。収集エンジンのマウント・完了処理は
 * SyncProvider が単独所有し、ここはスケジューリング（起動遅延・鮮度TTL・once-per-boot）だけを担う。
 * once-per-boot は syncSession.bulletinSyncedThisBoot＝**完走**で確定する（SyncProvider の完了処理が
 * 立てる。開始時に立てると kill switch 等の途中破棄で今起動分を空費する）。鮮度TTL内での見送りだけは
 * ここで確定してよい（収集自体が不要なため）。
 * アクセス可否（オフライン/メンテ帯/授業中）は runner 側の planSync が判定する（背景source＝無音スキップ）。
 * 開始できなかった場合は授業終了（running 下降）などの再レンダーで再試行される。
 */
export default function BackgroundBulletinSync() {
  // 授業時間帯(running=出席WebViewが稼働)はCLASSセッションを出席が専有するため、掲示収集を控える
  // （同一セッションの奪い合いで空ページ＝出席まで不安定化する）。running が下がれば再試行される。
  const { running } = useAttendanceEngine()
  const { runBulletinSync, bulletinBusy } = useSync()

  useEffect(() => {
    if (syncSession.bulletinSyncedThisBoot) return
    let cancelled = false
    const t = setTimeout(() => {
      if (cancelled || running) return
      loadBulletinRefreshedAt()
        .then((at) => {
          if (cancelled || syncSession.bulletinSyncedThisBoot) return
          if (!isBulletinStale(at)) {
            // 鮮度内＝この起動での収集は不要（見送り確定）。
            syncSession.bulletinSyncedThisBoot = true
            return
          }
          runBulletinSync({ source: 'boot' })
        })
        .catch(() => {
          if (!cancelled && !syncSession.bulletinSyncedThisBoot) runBulletinSync({ source: 'boot' })
        })
    }, START_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // bulletinBusy を依存に含める: 走行中に効果が再評価されても runner の in-flight ガードが弾き、
    // 完走（busy下降）後にまだ未確定なら（＝途中破棄されていたら）再試行の機会になる。
  }, [running, runBulletinSync, bulletinBusy])

  return null
}
