/**
 * 外部の宛先（提供者のサーバー・連絡先・ストアのページ）を1か所に集める（RN非依存・vitest対象）。
 *
 * **なぜ環境変数か**: ソースを公開した時、第三者が何も設定せずにビルドしたアプリが提供者（waiteu）の
 * サーバーへ通信しないようにするため。秘密を守るためではない（`EXPO_PUBLIC_*` はビルド時に JS へ
 * 埋め込まれ、配布物から読める）。値は `.env`（git 外）で渡す。キー名の一覧は `.env.example`。
 *
 * 未設定・空文字は null ＝「その機能が無い」扱い。呼び出し側は null のとき入口を出さず、通信もしない。
 * 提供者の配るビルドで設定し忘れる事故は `scripts/check-release-env.mjs`（焼く前に叩く）と
 * `src/config/releaseEnv.test.ts` のラチェットで止める。
 *
 * ⚠ `process.env.EXPO_PUBLIC_*` は**メンバ式の直書き**でだけ babel-preset-expo がビルド時に定数化する
 * （releaseStage.ts・review/reviewForce.ts と同じ）。分割代入・動的キー・ループに書き換えないこと
 * （書き換えるとビルド後に undefined になり、提供者のビルドからも全機能が黙って消える）。
 */

/** 前後の空白を落とし、空なら null。 */
export function normalizeEndpoint(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  return v === '' ? null : v
}

/** 停止指示ファイル（status.json）。未設定ならキルスイッチ自体が無い（取得もキャッシュの適用もしない）。 */
export const KILL_SWITCH_URL: string | null = normalizeEndpoint(process.env.EXPO_PUBLIC_KILLSWITCH_URL)

/** フィードバックの送信先（letus-api）。未設定なら送信せず、メール宛先も無ければ入口を出さない。 */
export const FEEDBACK_ENDPOINT: string | null = normalizeEndpoint(process.env.EXPO_PUBLIC_FEEDBACK_URL)

/** 紹介ページ（停止画面・お知らせ帯の脱出先、共有の文面）。未設定なら紹介ページ・共有の入口を出さない。 */
export const LITUS_SITE_URL: string | null = normalizeEndpoint(process.env.EXPO_PUBLIC_SITE_URL)

/** 連絡先メール（フィードバック送信失敗時の mailto）。未設定なら mailto と宛先の文言を出さない。 */
export const CONTACT_EMAIL: string | null = normalizeEndpoint(process.env.EXPO_PUBLIC_CONTACT_EMAIL)

/** App Store の評価ページ。未設定なら iOS で評価の依頼を出さない。 */
export const IOS_REVIEW_URL: string | null = normalizeEndpoint(process.env.EXPO_PUBLIC_IOS_REVIEW_URL)

/** Google Play の評価ページ。未設定なら Android で評価の依頼を出さない。 */
export const ANDROID_REVIEW_URL: string | null = normalizeEndpoint(process.env.EXPO_PUBLIC_ANDROID_REVIEW_URL)

/** フィードバックの入口（設定・出席の失敗時）を出すか。送り先が1つも無ければ出さない。 */
export function isFeedbackAvailable(endpoint: string | null, contactEmail: string | null): boolean {
  return endpoint !== null || contactEmail !== null
}

export const FEEDBACK_AVAILABLE: boolean = isFeedbackAvailable(FEEDBACK_ENDPOINT, CONTACT_EMAIL)
