import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { loadAllTimetables } from '../storage/timetableStore'
import { mutateAutoRegisteredCancelKeys } from '../storage/autoRegisteredCancelsStore'
import { mutateClassEvents } from '../storage/classEventsStore'
import { parseBulletinEvents } from '../timetableEvents/bulletinEvents'
import { pruneExpiredLedgerKeys, selectAutoRegisterCandidates } from '../timetableEvents/autoCancelLedger'
import { dateToYmd } from '../timetableEvents/eventDateValue'
import { capNotifiedIds } from '../notifications/bulletinNotify'
import type { ClassEvent } from '../timetableEvents/classEvent'

// notifiedBulletinsStore の NOTIFIED_IDS_CAP と同じ値だが、無関係な台帳なので定数は独立させる
// （NOTIFIED_IDS_CAP を変えた時に無関係のこちらまで変わるのを避ける）。掃除は日付基準が主・これは保険。
const AUTO_CANCEL_LEDGER_CAP = 500

/**
 * 掲示由来の休講の自動登録（211 積み荷②）の関門B側のオーケストレーション。
 * 純粋な選別（autoCancelLedger.ts）と2つのストア（台帳・ClassEvents）を繋ぐ薄い層。
 * 呼び出し元（BulletinSyncEngine）が新着通知と同じ層・別の try で呼ぶこと。
 *
 * 台帳のキー追加とClassEventsへの追加は別ストアなので厳密には原子的でない。
 * 台帳を先に書く（＝万一 ClassEvents 側の書き込みだけ失敗しても、次回同期で
 * 「もう登録済み」として静かに諦める side。逆にすると、稀な二重失敗時に
 * 利用者が消した休講が復活しうる＝撤去した欠陥の方向に倒れるため、こちら側を選ぶ）。
 */
export async function autoRegisterCancelsFromBulletins(
  incoming: BulletinItem[],
  now: Date = new Date(),
): Promise<{ added: number }> {
  const candidates = incoming.flatMap((it) => parseBulletinEvents(it)).filter((c) => c.type === 'cancel')
  const today = dateToYmd(now)
  const timetables = await loadAllTimetables()

  let toAdd: ClassEvent[] = []
  const result = await mutateAutoRegisteredCancelKeys((keys) => {
    // date < today のキーは登録の都度（掲示に休講候補が無い回も含め）毎回掃除する。
    const pruned = pruneExpiredLedgerKeys(keys, today)
    const picked = selectAutoRegisterCandidates(candidates, pruned, timetables)
    toAdd = picked.toAdd
    return capNotifiedIds([...pruned, ...picked.keysToAdd], AUTO_CANCEL_LEDGER_CAP)
  })
  if (result === null) {
    // 台帳が壊れていて読めない: 自動登録しない（210と同じ挙動へ落ちる・禁止事項4）。
    return { added: 0 }
  }

  if (toAdd.length > 0) {
    await mutateClassEvents((cur) => {
      const byId = new Map(cur.map((e) => [e.id, e]))
      for (const e of toAdd) byId.set(e.id, e)
      return [...byId.values()]
    })
  }

  return { added: toAdd.length }
}
