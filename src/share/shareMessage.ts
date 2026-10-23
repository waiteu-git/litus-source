import { LITUS_SITE_URL } from '../health/notice'

/**
 * 設定「友だちに教える」で OS の共有シートに渡す中身（純粋・RN 非依存）。
 * 設計: docs/design/2026-10-09-G-share-to-friends.md §4・§5（文言は 2026-10-09 本人の決定）
 *
 * - 固定の文字列だけ。ユーザーの保存値（科目・時間割・課題・氏名など）は一切参照しない。
 * - URL は LITUS_SITE_URL そのもの（計測の印・クエリ・# を付けない）。
 * - 「非公式」は必須（LP の OG プレビューに非公式が実質出ないため、相手に届く文面で唯一はっきり示せる場所）。
 * - title・url は渡さない（Android では title が件名になる／iOS で url と message の両方を入れると URL が二重になり得る）。
 *   options（件名・見出し）も渡さない。
 */
export const SHARE_LINE = 'LETUSの課題もCLASSの時間割も、まとめて見られる非公式アプリ、リタス'

/** 共有の入口（設定「友だちに教える」）を出すか。紹介ページが未設定のビルドでは出さない。 */
export const SHARE_AVAILABLE: boolean = LITUS_SITE_URL !== null

/** 紹介ページが未設定なら null（共有しない）。 */
export function buildShareContent(siteUrl: string | null = LITUS_SITE_URL): { message: string } | null {
  if (siteUrl === null) return null
  return { message: `${SHARE_LINE}\n${siteUrl}` }
}
