import { describe, expect, it } from 'vitest'
import { countdownText, countdownFraction, countdownClock } from './countdown'

const at = (h: number, m: number, s = 0) => new Date(2026, 6, 7, h, m, s)

describe('countdownText', () => {
  it('終了時刻までの残りを時間+分で返す', () => {
    expect(countdownText('12:50〜14:30', at(13, 0))).toBe('あと1時間30分')
  })
  it('1時間未満は分+秒で返す', () => {
    expect(countdownText('12:50〜14:30', at(14, 29, 30))).toBe('あと0分30秒')
  })
  it('終了時刻ちょうど/過ぎは受付終了', () => {
    expect(countdownText('12:50〜14:30', at(14, 30))).toBe('受付終了')
    expect(countdownText('12:50〜14:30', at(14, 31))).toBe('受付終了')
  })
  it('confirmWindowがnullならnull', () => {
    expect(countdownText(null, at(13, 0))).toBeNull()
  })
  it('時刻を含まない文字列はnull', () => {
    expect(countdownText('受付中', at(13, 0))).toBeNull()
  })
})

describe('countdownFraction', () => {
  it('中間地点は約0.5', () => {
    // 12:50〜14:30 = 100分。13:40 で残り50分 → 0.5
    expect(countdownFraction('12:50〜14:30', at(13, 40))).toBeCloseTo(0.5, 2)
  })
  it('開始前は1にクランプ', () => {
    expect(countdownFraction('12:50〜14:30', at(12, 0))).toBe(1)
  })
  it('終了後は0にクランプ', () => {
    expect(countdownFraction('12:50〜14:30', at(15, 0))).toBe(0)
  })
  it('null/解析不能はnull', () => {
    expect(countdownFraction(null, at(13, 0))).toBeNull()
    expect(countdownFraction('受付中', at(13, 0))).toBeNull()
  })
})

describe('countdownClock', () => {
  it('1時間以上は H:MM:SS', () => {
    expect(countdownClock('12:50〜14:30', at(13, 3, 18))).toBe('1:26:42')
  })
  it('1時間未満は MM:SS（ゼロ詰め）', () => {
    expect(countdownClock('13:05〜13:20', at(13, 11, 18))).toBe('08:42')
  })
  it('終了/超過は受付終了', () => {
    expect(countdownClock('12:50〜14:30', at(14, 30))).toBe('受付終了')
  })
  it('nullはnull', () => {
    expect(countdownClock(null, at(13, 0))).toBeNull()
  })
})
