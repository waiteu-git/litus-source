import { describe, it, expect } from 'vitest'
import { staggerSameInstant } from './staggerFireAt'

type Item = { id: string; fireAt: string }
const keyOf = (t: Item) => t.id

describe('staggerSameInstant', () => {
  /**
   * 実コードで同一 fireAt が出る経路は3つある（当日イベントは全て8:00固定・同一締切の課題・
   * 同一曜限に積まれた別科目の出席開始）。そのまま貼ると同一ミリ秒に複数のヘッドアップと音が
   * 重なり、実機で「一気に2つきてうるさい」になる。
   */
  it('同一時刻の3件を 0/20s/40s へずらす', () => {
    const out = staggerSameInstant(
      [
        { id: 'c', fireAt: '2026-07-22T08:00:00.000Z' },
        { id: 'a', fireAt: '2026-07-22T08:00:00.000Z' },
        { id: 'b', fireAt: '2026-07-22T08:00:00.000Z' },
      ],
      20_000,
      keyOf,
    )
    const byId = new Map(out.map((o) => [o.id, o.fireAt]))
    expect(byId.get('a')).toBe('2026-07-22T08:00:00.000Z')
    expect(byId.get('b')).toBe('2026-07-22T08:00:20.000Z')
    expect(byId.get('c')).toBe('2026-07-22T08:00:40.000Z')
  })

  it('入力順が違っても key 昇順で同じ結果になる（決定論）', () => {
    const items: Item[] = [
      { id: 'b', fireAt: '2026-07-22T08:00:00.000Z' },
      { id: 'a', fireAt: '2026-07-22T08:00:00.000Z' },
    ]
    const forward = staggerSameInstant(items, 20_000, keyOf)
    const reversed = staggerSameInstant([...items].reverse(), 20_000, keyOf)
    const norm = (xs: Item[]) => [...xs].sort((x, y) => x.id.localeCompare(y.id)).map((x) => x.fireAt)
    expect(norm(forward)).toEqual(norm(reversed))
  })

  it('単独の時刻・異なる時刻は変えない', () => {
    const items: Item[] = [
      { id: 'a', fireAt: '2026-07-22T08:00:00.000Z' },
      { id: 'b', fireAt: '2026-07-22T09:00:00.000Z' },
    ]
    expect(staggerSameInstant(items, 20_000, keyOf).map((x) => x.fireAt)).toEqual([
      '2026-07-22T08:00:00.000Z',
      '2026-07-22T09:00:00.000Z',
    ])
  })

  it('出力の順序は入力順を保つ', () => {
    const items: Item[] = [
      { id: 'c', fireAt: '2026-07-22T08:00:00.000Z' },
      { id: 'a', fireAt: '2026-07-22T08:00:00.000Z' },
    ]
    expect(staggerSameInstant(items, 20_000, keyOf).map((x) => x.id)).toEqual(['c', 'a'])
  })

  it('入力配列も要素も破壊しない', () => {
    const items: Item[] = [
      { id: 'a', fireAt: '2026-07-22T08:00:00.000Z' },
      { id: 'b', fireAt: '2026-07-22T08:00:00.000Z' },
    ]
    const snapshot = JSON.parse(JSON.stringify(items))
    staggerSameInstant(items, 20_000, keyOf)
    expect(items).toEqual(snapshot)
  })

  it('元の要素の他のフィールドを保つ', () => {
    const out = staggerSameInstant(
      [
        { id: 'a', fireAt: '2026-07-22T08:00:00.000Z', title: 'x' },
        { id: 'b', fireAt: '2026-07-22T08:00:00.000Z', title: 'y' },
      ],
      20_000,
      (t) => t.id,
    )
    expect(out.map((o) => o.title)).toEqual(['x', 'y'])
  })

  it('空配列を受け付ける', () => {
    expect(staggerSameInstant([], 20_000, keyOf)).toEqual([])
  })

  it('不正な fireAt はそのまま通す（予約側で落ちるのに任せる）', () => {
    const out = staggerSameInstant([{ id: 'a', fireAt: 'not-a-date' }], 20_000, keyOf)
    expect(out[0].fireAt).toBe('not-a-date')
  })
})
