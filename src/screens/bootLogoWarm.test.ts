import { describe, expect, it } from 'vitest'
import {
  toWarmBootHtml,
  WARM_BOOT_LOGO_GREEN,
  WARM_BOOT_LOGO_WHITE,
} from './bootLogoWarm'

describe('toWarmBootHtml', () => {
  it('イントロ（both フィル）は 0s に畳む', () => {
    expect(toWarmBootHtml('animation:mergeTop 2.4s linear 0.45s both')).toBe(
      'animation:mergeTop 0s both',
    )
    expect(
      toWarmBootHtml('animation:fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 2.9s both'),
    ).toBe('animation:fadeUp 0s both')
  })

  it('ループ（infinite）はディレイからイントロ長4.0sを引く', () => {
    expect(
      toWarmBootHtml('animation:barSlide 1.4s cubic-bezier(0.65,0,0.35,1) 4s infinite'),
    ).toBe('animation:barSlide 1.4s cubic-bezier(0.65,0,0.35,1) 0s infinite')
    expect(
      toWarmBootHtml('animation:boltBreathe 2.8s ease-in-out 4s infinite'),
    ).toBe('animation:boltBreathe 2.8s ease-in-out 0s infinite')
  })

  it('letterWave のスタッガー間隔0.06sを保存する', () => {
    expect(
      toWarmBootHtml('animation:liIn 2.4s 0.45s both, letterWave 1.4s ease-in-out 4.00s infinite'),
    ).toBe('animation:liIn 0s both, letterWave 1.4s ease-in-out 0s infinite')
    expect(
      toWarmBootHtml('animation:tusIn 2.4s 0.45s both, letterWave 1.4s ease-in-out 4.06s infinite'),
    ).toBe('animation:tusIn 0s both, letterWave 1.4s ease-in-out 0.06s infinite')
    expect(
      toWarmBootHtml('animation:tusIn 2.4s 0.45s both, letterWave 1.4s ease-in-out 4.24s infinite'),
    ).toBe('animation:tusIn 0s both, letterWave 1.4s ease-in-out 0.24s infinite')
  })

  it('複合（イントロ+ループ）を個別に変換する', () => {
    expect(
      toWarmBootHtml(
        'animation:boltIn 0.8s cubic-bezier(0.16,1,0.3,1) both, boltBreathe 2.8s ease-in-out 4s infinite',
      ),
    ).toBe('animation:boltIn 0s both, boltBreathe 2.8s ease-in-out 0s infinite')
  })

  it('animation:none はそのまま', () => {
    expect(toWarmBootHtml('animation:none')).toBe('animation:none')
  })

  it('実バリアントに非ゼロのイントロ由来ディレイ（4s系）が残らない', () => {
    for (const html of [WARM_BOOT_LOGO_GREEN, WARM_BOOT_LOGO_WHITE]) {
      expect(html).not.toMatch(/animation:[^;"]*\b4(?:\.\d+)?s\s+infinite/)
      expect(html).not.toMatch(/animation:[^;"]*\b2\.4s[^;"]*\bboth/)
    }
  })

  it('実バリアントは変換で必ず変化する（パターン不一致の検知）', () => {
    // 生成物が将来変わってパターンに当たらなくなったら気付けるように。
    // 変換が何も効いていなければ入力=出力になり、この期待が落ちる。
    expect(WARM_BOOT_LOGO_GREEN).toContain('0s infinite')
    expect(WARM_BOOT_LOGO_WHITE).toContain('0s infinite')
  })
})
