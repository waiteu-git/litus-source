import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reservedLineBoxHeight } from './reservedLineBox'

describe('reservedLineBoxHeight', () => {
  it('2行分の高さを lineHeight から導出する', () => {
    expect(reservedLineBoxHeight({ lineHeight: 21, lines: 2, fontScale: 1, itemCount: 3 })).toBe(42)
  })

  it('fontScale に追随する（lineHeight は fontScale で伸びるが minHeight は dp のまま伸びないため）', () => {
    expect(reservedLineBoxHeight({ lineHeight: 21, lines: 2, fontScale: 1.3, itemCount: 3 })).toBeCloseTo(54.6)
    expect(reservedLineBoxHeight({ lineHeight: 21, lines: 2, fontScale: 2, itemCount: 3 })).toBe(84)
  })

  it('不正な fontScale は 1 にフォールバックする', () => {
    for (const fontScale of [0, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(reservedLineBoxHeight({ lineHeight: 21, lines: 2, fontScale, itemCount: 3 })).toBe(42)
    }
  })

  it('自動送りが起きない（itemCount<=1）なら確保しない', () => {
    expect(reservedLineBoxHeight({ lineHeight: 21, lines: 2, fontScale: 1, itemCount: 1 })).toBeUndefined()
    expect(reservedLineBoxHeight({ lineHeight: 21, lines: 2, fontScale: 1, itemCount: 0 })).toBeUndefined()
  })

  it('1行しか描かないなら高さは変わらないので確保しない', () => {
    expect(reservedLineBoxHeight({ lineHeight: 21, lines: 1, fontScale: 1, itemCount: 3 })).toBeUndefined()
  })

  it('確保不足が起きない（任意の fontScale で lines*lineHeight*fontScale 以上）', () => {
    for (let s = 0.85; s <= 3.0001; s += 0.05) {
      const got = reservedLineBoxHeight({ lineHeight: 21, lines: 2, fontScale: s, itemCount: 2 })
      expect(got).toBeDefined()
      expect(got as number).toBeGreaterThanOrEqual(2 * 21 * s - 1e-9)
    }
  })
})

describe('HomeScreen の掲示タイトル（値の二重管理を機械的に止める）', () => {
  const src = readFileSync(new URL('../screens/HomeScreen.tsx', import.meta.url), 'utf8')

  it('bulletinTitle の lineHeight は定数を参照する', () => {
    const m = src.match(/bulletinTitle:\s*\{[^}]*\}/)
    expect(m, 'styles.bulletinTitle が見つからない').toBeTruthy()
    expect(m![0]).toContain('lineHeight: BULLETIN_TITLE_LINE_HEIGHT')
    // 42 も 21 も直書きしない（正典は定数1箇所）
    expect(m![0]).not.toMatch(/\b(21|42)\b/)
  })

  it('確保高さは reservedLineBoxHeight 経由で与える（42 の直書き禁止）', () => {
    expect(src).toContain('reservedLineBoxHeight')
    expect(src).toMatch(/const BULLETIN_TITLE_LINE_HEIGHT = 21\b/)
    expect(src).toMatch(/const BULLETIN_TITLE_LINES = 2\b/)
  })
})
