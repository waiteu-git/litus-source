import { describe, expect, it } from 'vitest'
import { countdownText, countdownFraction, countdownClock, countdownRemainingSec } from './countdown'

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

describe('countdownRemainingSec', () => {
  it('残り秒を返す', () => {
    expect(countdownRemainingSec('12:50〜14:30', at(14, 29, 30))).toBe(30)
    expect(countdownRemainingSec('12:50〜14:30', at(13, 30))).toBe(3600)
  })

  it('終了済みは0以下の数値（nullにしない＝「不明」と区別できる）', () => {
    expect(countdownRemainingSec('12:50〜14:30', at(14, 30))).toBe(0)
    expect(countdownRemainingSec('12:50〜14:30', at(14, 31))).toBe(-60)
  })

  it('受付時間が分からないときだけ null', () => {
    expect(countdownRemainingSec(null, at(13, 0))).toBeNull()
    expect(countdownRemainingSec('受付中', at(13, 0))).toBeNull()
    expect(countdownRemainingSec('14:30〜12:50', at(13, 0))).toBeNull()
  })

  it('「終了」と「不明」を取り違えない（countdownClockのtruthy判定が壊れる理由）', () => {
    // countdownClock は終了時も truthy な文字列を返すので、状態判定には使えない。
    // これを混同すると「提出の受付終了まで 受付終了」という文が出る（実機で再現済み）。
    expect(countdownClock('12:50〜14:30', at(15, 0))).toBe('受付終了')
    expect(countdownRemainingSec('12:50〜14:30', at(15, 0))).toBeLessThanOrEqual(0)
    expect(countdownRemainingSec('壊れた値', at(15, 0))).toBeNull()
  })
})
