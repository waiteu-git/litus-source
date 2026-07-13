import { describe, it, expect } from 'vitest'
import { TYPE, RADIUS, SPACE, SHADOW } from './scale'

describe('TYPE スケール', () => {
  it('DADS基準の7段（本文16/行間1.6・高密度14/1.3）', () => {
    expect(TYPE.body).toEqual({ fontSize: 16, lineHeight: 25.6 })
    expect(TYPE.dense).toEqual({ fontSize: 14, lineHeight: 18.2 })
    expect(TYPE.screenTitle).toEqual({ fontSize: 21, lineHeight: 28.35, fontWeight: '700' })
    expect(TYPE.stat.fontSize).toBe(24)
  })
  it('小数fontSizeや800ウェイトを含まない', () => {
    for (const k of Object.keys(TYPE) as (keyof typeof TYPE)[]) {
      expect(Number.isInteger(TYPE[k].fontSize)).toBe(true)
      expect(['400', '500', '700', undefined]).toContain(TYPE[k].fontWeight)
    }
  })
})

describe('RADIUS / SPACE / SHADOW', () => {
  it('RADIUS は sm8/md12/card18/sheet20/pill999', () => {
    expect(RADIUS).toEqual({ sm: 8, md: 12, card: 18, sheet: 20, pill: 999 })
  })
  it('SPACE は 4/8/12/14/16/24', () => {
    expect([SPACE.s1, SPACE.s2, SPACE.s3, SPACE.s4, SPACE.s5, SPACE.s6]).toEqual([4, 8, 12, 14, 16, 24])
  })
  it('card影は無し(null)・floating/fabは影オブジェクト', () => {
    expect(SHADOW.card).toBeNull()
    expect(SHADOW.floating.shadowOpacity).toBe(0.2)
    expect(SHADOW.fab.shadowOpacity).toBe(0.3)
  })
})
