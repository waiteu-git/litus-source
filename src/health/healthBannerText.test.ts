import { describe, expect, it } from 'vitest'
import { healthBannerText } from './healthBannerText'

describe('healthBannerText', () => {
  it('structure_drift はキャッシュ表示の正直な一文', () => {
    expect(healthBannerText({ status: 'structure_drift' }, 'class'))
      .toBe('最新の取得に失敗しました。表示は前回取得時点です。')
  })
  it('not_logged_in はソース別', () => {
    expect(healthBannerText({ status: 'not_logged_in' }, 'class')).toBe('CLASSへのログインが必要です。')
    expect(healthBannerText({ status: 'not_logged_in' }, 'letus')).toBe('LETUSへのログインが必要です。')
  })
  it('maintenance はCLASS定時メンテの案内', () => {
    expect(healthBannerText({ status: 'maintenance' }, 'class'))
      .toBe('CLASSはメンテナンス中です（毎日2:00–4:00）。')
  })
  it('ok / empty_valid / blocked / 未保存(null) はバナーなし', () => {
    expect(healthBannerText({ status: 'ok', count: 3 }, 'class')).toBeNull()
    expect(healthBannerText({ status: 'empty_valid' }, 'class')).toBeNull()
    expect(healthBannerText({ status: 'blocked' }, 'class')).toBeNull()
    expect(healthBannerText(null, 'class')).toBeNull()
    expect(healthBannerText(undefined, 'letus')).toBeNull()
  })
})
