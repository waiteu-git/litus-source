import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../auth/AuthProvider'
import { syncSession } from './syncSession'
import LetusSyncEngine from './LetusSyncEngine'

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
  const auth = useAuth()

  useEffect(() => {
    if (active || finished || syncSession.didFullSync) return
    if (auth.letus === 'authenticated') {
      const t = setTimeout(() => setActive(true), START_DELAY_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setActive(true), AUTH_WAIT_MS)
    return () => clearTimeout(t)
  }, [active, finished, auth.letus])

  // フォアグラウンド復帰時、前回同期から一定時間経過していれば再同期を許可する。
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return
      const last = syncSession.lastFullSyncAt
      if (last != null && Date.now() - last > RESYNC_INTERVAL_MS) {
        syncSession.didFullSync = false
        setFinished(false)
        setActive(false) // 次のeffectで遅延開始し直す
      }
    })
    return () => sub.remove()
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
