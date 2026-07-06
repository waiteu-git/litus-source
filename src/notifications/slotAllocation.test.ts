import { allocateNotificationSlots, type SlotRequest } from './slotAllocation'

function req(id: string, priority: number, fireAt: string): SlotRequest {
  return { id, priority, fireAt }
}

describe('allocateNotificationSlots', () => {
  it('cap以下なら全件を優先度→発火時刻順で返す', () => {
    const input = [
      req('b', 1, '2026-07-10T00:00:00.000Z'),
      req('a', 0, '2026-07-11T00:00:00.000Z'),
      req('c', 1, '2026-07-09T00:00:00.000Z'),
    ]
    expect(allocateNotificationSlots(input, 5).map((r) => r.id)).toEqual(['a', 'c', 'b'])
  })
  it('cap超過は低優先度から落とす（高優先度は遠い発火でも残る）', () => {
    const input = [
      req('far-attendance', 0, '2026-07-30T00:00:00.000Z'),
      req('soon-digest', 2, '2026-07-07T00:00:00.000Z'),
      req('soon-reminder', 1, '2026-07-08T00:00:00.000Z'),
    ]
    // cap=2: 優先度0と1が残り、優先度2(soon-digest)が落ちる
    expect(allocateNotificationSlots(input, 2).map((r) => r.id)).toEqual(['far-attendance', 'soon-reminder'])
  })
  it('同一優先度内は発火の早い方を残し、遠い方を落とす', () => {
    const input = [
      req('late', 1, '2026-07-20T00:00:00.000Z'),
      req('early', 1, '2026-07-08T00:00:00.000Z'),
      req('mid', 1, '2026-07-12T00:00:00.000Z'),
    ]
    expect(allocateNotificationSlots(input, 2).map((r) => r.id)).toEqual(['early', 'mid'])
  })
  it('cap 0 / 負数は空', () => {
    const input = [req('a', 0, '2026-07-08T00:00:00.000Z')]
    expect(allocateNotificationSlots(input, 0)).toEqual([])
    expect(allocateNotificationSlots(input, -1)).toEqual([])
  })
  it('入力配列を破壊しない', () => {
    const input = [
      req('b', 1, '2026-07-10T00:00:00.000Z'),
      req('a', 0, '2026-07-11T00:00:00.000Z'),
    ]
    const snapshot = JSON.parse(JSON.stringify(input))
    allocateNotificationSlots(input, 1)
    expect(input).toEqual(snapshot)
  })
})
