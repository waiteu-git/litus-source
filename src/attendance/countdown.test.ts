import { describe, expect, it } from 'vitest'
import { countdownText } from './countdown'

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
