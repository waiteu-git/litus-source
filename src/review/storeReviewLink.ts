/**
 * 設定「アプリ情報」の常設リンク「ストアで評価する」の行き先と表示条件（RN非依存・vitest対象）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.7・§10-4
 *
 * これは API ではなく通常の URL。Apple は評価ページへの常設リンクを推奨し、Google はクォータ到達時の代替として
 * 案内している。expo-store-review は使わない（依頼 API に届く経路を作らない）。
 * iOS の Apple ID は App Store Connect のアプリレコード（2026-08-10 作成・Bundle ID dev.waiteu.litus）。
 */
import type { ReleaseStage } from '../releaseStage'

export const IOS_REVIEW_URL = 'https://apps.apple.com/jp/app/id6799900160?action=write-review'
export const ANDROID_REVIEW_URL = 'https://play.google.com/store/apps/details?id=dev.waiteu.litus'

/** Platform.OS に対応する行き先。iOS・Android 以外は null（リンクを出さない）。 */
export function storeReviewUrl(os: string): string | null {
  if (os === 'ios') return IOS_REVIEW_URL
  if (os === 'android') return ANDROID_REVIEW_URL
  return null
}

/** production かつデモでない時だけ出す。デモの利用者はまだ実際に使っておらず、ベータ・開発版はストアに載らない。 */
export function showStoreReviewLink(stage: ReleaseStage, demo: boolean): boolean {
  return stage === 'production' && !demo
}
