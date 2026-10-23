/**
 * 設定「アプリ情報」の常設リンク「ストアで評価する」の行き先と表示条件（RN非依存・vitest対象）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.7・§10-4
 *
 * これは API ではなく通常の URL。Apple は評価ページへの常設リンクを推奨し、Google はクォータ到達時の代替として
 * 案内している。expo-store-review は使わない（依頼 API に届く経路を作らない）。
 * 行き先は環境変数（`src/config/endpoints.ts`・`EXPO_PUBLIC_IOS_REVIEW_URL`／`EXPO_PUBLIC_ANDROID_REVIEW_URL`）。
 * 提供者の値は `.env`（git 外）。iOS は App Store Connect のアプリレコード（Bundle ID dev.waiteu.litus）の評価ページ。
 */
import type { ReleaseStage } from '../releaseStage'
import { ANDROID_REVIEW_URL, IOS_REVIEW_URL } from '../config/endpoints'

export { ANDROID_REVIEW_URL, IOS_REVIEW_URL }

/** Platform.OS に対応する行き先。iOS・Android 以外、または行き先が未設定なら null（リンクを出さない）。 */
export function storeReviewUrl(
  os: string,
  urls: { ios: string | null; android: string | null } = { ios: IOS_REVIEW_URL, android: ANDROID_REVIEW_URL },
): string | null {
  if (os === 'ios') return urls.ios
  if (os === 'android') return urls.android
  return null
}

/** production かつデモでない時だけ出す。デモの利用者はまだ実際に使っておらず、ベータ・開発版はストアに載らない。 */
export function showStoreReviewLink(stage: ReleaseStage, demo: boolean): boolean {
  return stage === 'production' && !demo
}
