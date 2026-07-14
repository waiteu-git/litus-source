import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { syncSession } from './syncSession'
import { subscribeForeground } from '../app/foregroundOrchestrator'
import { useSync } from '../sync/SyncProvider'

// タブ入場直後の描画と競合しないよう開始を遅らせる。
const START_DELAY_MS = 2000
// LETUSのSSO確立を待つ上限。超えたら（判定unknownでも）ダメ元で開始する。
const AUTH_WAIT_MS = 30000
// フォアグラウンド復帰時、前回同期からこの時間を超えていれば再同期を許可する（鮮度維持）。
const RESYNC_INTERVAL_MS = 30 * 60 * 1000

/**
 * タブ入場（authed）後に1回、LETUSフル同期を発火する薄いトリガ。エンジンのマウント・完了処理・
 * syncSession の記録は SyncProvider が単独所有し、ここはスケジューリングだけを担う:
 * - 初回セットアップ（ゲートのsyncフェーズ）で完走済みの起動ではスキップ（syncSession.didFullSync）。
 * - LETUSのSSO確立（AuthProviderのウォームアップ完了）を待ってから開始する。早すぎると
 *   マイコースの代わりにSSOリダイレクト途中を掴んで空振りする（実機で確認）。
 * - フォアグラウンド復帰時、前回完走から RESYNC_INTERVAL_MS 超で再同期を許可する。
 * アクセス可否（オフライン/メンテ帯）は runner 側の planSync が判定する（背景source＝無音スキップ）。
 */
export default function BackgroundLetusSync() {
  // フォアグラウンド復帰の再評価トリガー（メンテ帯スキップ後、帯明けの復帰で開始し直すため）。
  const [wakeTick, setWakeTick] = useState(0)
  const auth = useAuth()
  const { runAssignmentsSync } = useSync()

  useEffect(() => {
    if (syncSession.didFullSync) return
    // runner が開始できない場合（オフライン/メンテ帯/実行中）は didFullSync が立たないため、
    // auth 変化・フォアグラウンド復帰（wakeTick）のたびに再評価される。
    const delay = auth.letus === 'authenticated' ? START_DELAY_MS : AUTH_WAIT_MS
    const t = setTimeout(() => {
      // 待機中に手動同期（課題画面/ホーム統合同期）が完走していれば不要（発火直前に再確認。
      // 30分再同期パスは subscribeForeground が didFullSync を先に落としてから wakeTick を上げる）。
      if (syncSession.didFullSync) return
      runAssignmentsSync({ source: wakeTick > 0 ? 'foreground' : 'boot' })
    }, delay)
    return () => clearTimeout(t)
  }, [auth.letus, wakeTick, runAssignmentsSync])

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
        setWakeTick((t) => t + 1) // 次のeffectで遅延開始し直す
      }
    })
  }, [])

  return null
}
