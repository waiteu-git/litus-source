/**
 * 掲示から抽出した休講候補を、利用者の操作を待たずに ClassEvent として登録する副作用層。
 * 選別そのものは純粋関数 `autoRegisterableCancels` が持つ（絞り込みの理由はそちらに書いてある）。
 *
 * 動機（2026-08-28 ユーザー裁定）: 掲示に休講が出ているのに登録待ちだったため、
 * **休講の日にも出席アラームが鳴っていた**。`notificationRefresh` の `cancelled` は
 * 登録済み ClassEvent からしか作られない（実測）ので、登録まで進めないと止まらない。
 *
 * ⚠ **可逆であることが前提**＝登録された休講は時間割に「休講」として見え、手で削除できる。
 * 見えない抑制にはしない（誤った抑制は出席を落とすため、利用者が気づける形にする）。
 */
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import { loadClassEvents, saveClassEvents } from '../storage/classEventsStore'
import { autoRegisterableCancels, parseBulletinEvents } from './bulletinEvents'
import { refreshAllNotifications } from '../notifications/notificationRefresh'

/** 追加した件数を返す（0なら何も書かない＝無駄な書き込みと通知の貼り直しをしない）。 */
export async function autoRegisterBulletinCancels(now: Date = new Date()): Promise<number> {
  const digest = await loadBulletinDigest()
  const candidates = digest.flatMap((it) => parseBulletinEvents(it))
  if (candidates.length === 0) return 0
  const existing = await loadClassEvents()
  const add = autoRegisterableCancels(candidates, existing, now)
  if (add.length === 0) return 0
  await saveClassEvents([...existing, ...add])
  // 予約通知を貼り直す。ここを呼ばないと「登録はされたのにアラームは鳴る」＝
  // この機能が解こうとした問題がそのまま残る。
  await refreshAllNotifications(now)
  return add.length
}
