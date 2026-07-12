import type { CollectionHealth } from './collectionHealth'
import { maintenanceWindowLabel } from './maintenanceWindow'
import type { AccessReason } from './accessGate'

export type HealthSource = 'class' | 'letus'

function maintenanceTextWithGuarantee(source: HealthSource): string {
  return source === 'letus'
    ? `LETUSはメンテナンス中です（毎日${maintenanceWindowLabel('letus')}）。保存済みの情報は閲覧できます。`
    : `CLASSはメンテナンス中です（毎日${maintenanceWindowLabel('class')}）。保存済みの情報は閲覧できます。`
}

/**
 * 層1の正直表示バナーの文言（純粋）。null はバナーを出さない。
 * 表示優先度は offline > maintenance（時刻/接続ベース） > scrapeヘルス。
 * blocked（PC競合/一時的失敗）は次回の再収集で解けるため騒がない。
 */
export function healthBannerText(
  health: CollectionHealth | null | undefined,
  source: HealthSource,
  access?: AccessReason,
): string | null {
  if (access === 'offline') return 'オフラインです。保存済みの情報を表示しています。'
  if (access === 'maintenance') return maintenanceTextWithGuarantee(source)
  if (!health) return null
  switch (health.status) {
    case 'structure_drift':
      return '最新の取得に失敗しました。表示は前回取得時点です。'
    case 'not_logged_in':
      return source === 'letus' ? 'LETUSへのログインが必要です。' : 'CLASSへのログインが必要です。'
    case 'maintenance':
      return source === 'letus'
        ? `LETUSはメンテナンス中です（毎日${maintenanceWindowLabel('letus')}）。`
        : `CLASSはメンテナンス中です（毎日${maintenanceWindowLabel('class')}）。`
    default:
      return null // ok / empty_valid / blocked
  }
}
