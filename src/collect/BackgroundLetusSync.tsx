import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { syncSession } from './syncSession'
import LetusSyncEngine from './LetusSyncEngine'

// タブ入場直後の描画と競合しないよう開始を遅らせる。
const START_DELAY_MS = 2000
// LETUSのSSO確立を待つ上限。超えたら（判定unknownでも）ダメ元で開始する。
const AUTH_WAIT_MS = 30000

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

  if (!active || finished || syncSession.didFullSync) return null
  return (
    <LetusSyncEngine
      onFinished={() => {
        syncSession.didFullSync = true
        setFinished(true)
      }}
    />
  )
}
