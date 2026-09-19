import { describe, expect, it } from 'vitest'
import { computeTileRows, type TileLayoutItem } from './tileLayout'

function w(item: string): TileLayoutItem<string> {
  return { wide: true, item }
}
function h(item: string): TileLayoutItem<string> {
  return { wide: false, item }
}

describe('computeTileRows', () => {
  it('横長のみ: 全て単独行になる', () => {
    expect(computeTileRows([w('a'), w('b')])).toEqual([['a'], ['b']])
  })

  it('半幅のみ・偶数: 2個ずつ1行になる', () => {
    expect(computeTileRows([h('a'), h('b'), h('c'), h('d')])).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('半幅のみ・奇数: 最後の1個が単独行になる', () => {
    expect(computeTileRows([h('a'), h('b'), h('c')])).toEqual([['a', 'b'], ['c']])
  })

  it('横長と半幅の混在: 半幅の余りは次の横長の前で確定する', () => {
    // half a が溜まった状態で wide b が来る → [a]（余り単独行）→ [b]（横長単独行）
    expect(computeTileRows([h('a'), w('b'), h('c'), h('d')])).toEqual([['a'], ['b'], ['c', 'd']])
  })

  it('横長→半幅→横長: 半幅の余りは次の横長の直前で単独行になる', () => {
    expect(computeTileRows([w('a'), h('b'), w('c')])).toEqual([['a'], ['b'], ['c']])
  })

  it('0件: 空配列を返す', () => {
    expect(computeTileRows([])).toEqual([])
  })

  it('半幅ペアが揃ってから横長が来ても、先に確定済みの半幅行はそのまま', () => {
    expect(computeTileRows([h('a'), h('b'), w('c')])).toEqual([['a', 'b'], ['c']])
  })
})
