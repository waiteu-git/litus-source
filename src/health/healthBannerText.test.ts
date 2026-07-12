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
  it('maintenance はソース別の定時メンテ案内', () => {
    expect(healthBannerText({ status: 'maintenance' }, 'class'))
      .toBe('CLASSはメンテナンス中です（毎日2:00–4:00）。保存済みの情報は閲覧できます。')
    expect(healthBannerText({ status: 'maintenance' }, 'letus'))
      .toBe('LETUSはメンテナンス中です（毎日4:00–5:30）。保存済みの情報は閲覧できます。')
  })
  it('ok / empty_valid / blocked / 未保存(null) はバナーなし', () => {
    expect(healthBannerText({ status: 'ok', count: 3 }, 'class')).toBeNull()
    expect(healthBannerText({ status: 'empty_valid' }, 'class')).toBeNull()
    expect(healthBannerText({ status: 'blocked' }, 'class')).toBeNull()
    expect(healthBannerText(null, 'class')).toBeNull()
    expect(healthBannerText(undefined, 'letus')).toBeNull()
  })
})

describe('healthBannerText access分岐', () => {
  it('offline は source非依存の保証文言', () => {
    expect(healthBannerText(null, 'class', 'offline')).toBe('オフラインです。保存済みの情報を表示しています。')
    expect(healthBannerText({ status: 'ok' } as any, 'letus', 'offline')).toBe(
      'オフラインです。保存済みの情報を表示しています。',
    )
  })
  it('maintenance は source別・保証訴求つき', () => {
    expect(healthBannerText(null, 'class', 'maintenance')).toBe(
      'CLASSはメンテナンス中です（毎日2:00–4:00）。保存済みの情報は閲覧できます。',
    )
    expect(healthBannerText(null, 'letus', 'maintenance')).toBe(
      'LETUSはメンテナンス中です（毎日4:00–5:30）。保存済みの情報は閲覧できます。',
    )
  })
  it('access=ok / 省略時は従来の health.status 分岐', () => {
    expect(healthBannerText({ status: 'ok' } as any, 'class', 'ok')).toBeNull()
    expect(healthBannerText({ status: 'structure_drift' } as any, 'class')).toBe(
      '最新の取得に失敗しました。表示は前回取得時点です。',
    )
    expect(healthBannerText(null, 'class')).toBeNull()
  })
})
