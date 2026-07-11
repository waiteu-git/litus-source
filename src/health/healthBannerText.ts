import type { CollectionHealth } from './collectionHealth'

export type HealthSource = 'class' | 'letus'

/**
 * 層1の正直表示バナーの文言（純粋）。null はバナーを出さない。
 * blocked（PC競合/一時的失敗）は次回の再収集で解けるため騒がない。
 */
export function healthBannerText(
  health: CollectionHealth | null | undefined,
  source: HealthSource,
): string | null {
  if (!health) return null
  switch (health.status) {
    case 'structure_drift':
      return '最新の取得に失敗しました。表示は前回取得時点です。'
    case 'not_logged_in':
      return source === 'letus' ? 'LETUSへのログインが必要です。' : 'CLASSへのログインが必要です。'
    case 'maintenance':
      return 'CLASSはメンテナンス中です（毎日2:00–4:00）。'
    default:
      return null // ok / empty_valid / blocked
  }
}
