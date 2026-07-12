import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { syncSession } from './syncSession'
import LetusSyncEngine from './LetusSyncEngine'
import { maintenanceSystemAt } from '../health/maintenanceWindow'
import { subscribeForeground } from '../app/foregroundOrchestrator'

// タブ入場直後の描画と競合しないよう開始を遅らせる。
const START_DELAY_MS = 2000
// LETUSのSSO確立を待つ上限。超えたら（判定unknownでも）ダメ元で開始する。
const AUTH_WAIT_MS = 30000
// フォアグラウンド復帰時、前回同期からこの時間を超えていれば再同期を許可する（鮮度維持）。
const RESYNC_INTERVAL_MS = 30 * 60 * 1000

/**
 * タブ入場（authed）後に1回だけLETUSフル同期を裏で実行する（LetusSyncEngineの静かな起動係）。
 * 初回セットアップ（ゲートのsyncフェーズ）で完走済みの起動ではスキップ。
 * LETUSのSSO確立（AuthProviderのウォームアップ完了）を待ってから開始する:
 * 早すぎるとマイコースの代わりにSSOリダイレクト途中を掴んで空振りする（実機で確認）。
 */
export default function BackgroundLetusSync() {
  const [active, setActive] = useState(false)
  const [finished, setFinished] = useState(false)
  // フォアグラウンド復帰の再評価トリガー（メンテ帯スキップ後、帯明けの復帰で開始し直すため）。
  const [wakeTick, setWakeTick] = useState(0)
  const auth = useAuth()

  useEffect(() => {
    if (active || finished || syncSession.didFullSync) return
    // LETUS定時メンテナンス帯（4:00–5:30）は同期不能。ムダ打ちせずスキップし、復帰時に再評価する
    // （メンテ表示はHealthBannerが時間帯判定で出す）。
    if (maintenanceSystemAt(new Date()) === 'letus') return
    if (auth.letus === 'authenticated') {
      const t = setTimeout(() => setActive(true), START_DELAY_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setActive(true), AUTH_WAIT_MS)
    return () => clearTimeout(t)
  }, [active, finished, auth.letus, wakeTick])

  // フォアグラウンド復帰時、前回同期から一定時間経過していれば再同期を許可する
  // （オーケストレータのletusSyncスロット＝最後発。Auth再温め・出席再判定の後に来る）。
  useEffect(() => {
    return subscribeForeground('letusSync', () => {
      // didFullSyncは「完走済み」状態でのみtrue。進行中/待機中は触らない（同期の途中破棄を防ぐ）。
      if (!syncSession.didFullSync) {
        // 初回同期がメンテ帯スキップ等で未完のままなら、復帰を機に開始条件を再評価する。
        setWakeTick((t) => t + 1)
        return
      }
      const last = syncSession.lastFullSyncAt
      if (last != null && Date.now() - last > RESYNC_INTERVAL_MS) {
        syncSession.didFullSync = false
        setFinished(false)
        setActive(false) // 次のeffectで遅延開始し直す
      }
    })
  }, [])

  if (!active || finished || syncSession.didFullSync) return null
  return (
    <LetusSyncEngine
      onFinished={() => {
        syncSession.didFullSync = true
        syncSession.lastFullSyncAt = Date.now()
        setFinished(true)
      }}
    />
  )
}
