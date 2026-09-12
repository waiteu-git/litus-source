import { describe, it, expect } from 'vitest'
import { seeAllHitSlop } from './seeAllHitSlop'

describe('seeAllHitSlop（E0 H2）', () => {
  it('陽性: 未読2件以上（ドット行あり）は上14・下12', () => {
    expect(seeAllHitSlop(2)).toStrictEqual({ top: 14, bottom: 12 })
    expect(seeAllHitSlop(7)).toStrictEqual({ top: 14, bottom: 12 })
  })
  it('陰性: 未読1件（ドット行なし）は上へ広げない＝スライドの差出人の行へのタップを奪わない', () => {
    expect(seeAllHitSlop(1)).toStrictEqual({ top: 0, bottom: 12 })
  })
  it('上はドット行（marginTop 10＋高さ6＝16）未満、下はカードの下余白12以下＝カードの外へ出さない', () => {
    expect(seeAllHitSlop(2).top).toBeLessThan(10 + 6)
    expect(seeAllHitSlop(2).bottom).toBeLessThanOrEqual(12)
  })
})
