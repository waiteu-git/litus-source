/**
 * 通知枠の優先度配分（純粋関数）。
 * iOSは1アプリあたり保留通知が最大64件で、超過分は取りこぼす（発火の早い順に自動選別される）。
 * 出席・課題締切前・朝まとめの3スケジューラが同じ枠を食い合うため、iOS任せにすると far-future の
 * 課題通知が近接の出席ナッジを押し出しうる。本関数は優先度→発火時刻の順で上位 cap 件を確定させ、
 * 高優先度（出席）の必須通知が落ちないことを保証する。端末非依存・非破壊。
 */

export type SlotRequest = {
  /** タグ＋キーなど安定した識別子。 */
  id: string
  /** 発火時刻 ISO 8601。 */
  fireAt: string
  /** 小さいほど高優先（0 が最優先）。 */
  priority: number
}

/** 優先度昇順→発火時刻昇順で上位 cap 件を返す。cap 以下は無害。 */
export function allocateNotificationSlots(requests: SlotRequest[], cap: number): SlotRequest[] {
  if (cap <= 0) return []
  return [...requests]
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime()
    })
    .slice(0, cap)
}
