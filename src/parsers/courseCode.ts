/**
 * TUSの科目ID（コース番号）。7文字で、先頭4桁が数字・続く3文字は数字または英大文字。
 * 例: 9975311 / 9960757（数字のみ）, 9975A06（機械航空宇宙力学1）, 9960E09（言語と異文化1）,
 *     9960S01（創域特別講義）のように**英字を含むコードがある**。
 *
 * 旧実装は `\d{7}` 固定で英字入りコードを取りこぼし、当該コースが `codes:[]` になって
 * コース一覧（コード→コースのマップ）と課題対応から消えていた（実機バグ 2026-07-10）。
 */
/** 文字列がちょうど科目IDか。 */
export function isCourseCode(s: string): boolean {
  return /^\d{4}[0-9A-Z]{3}$/.test(s)
}

/** 文中の最初の科目IDを返す（無ければ null）。 */
export function firstCourseCode(text: string): string | null {
  const m = text.match(/\d{4}[0-9A-Z]{3}/)
  return m ? m[0] : null
}

/** 文中の全科目IDを返す（統合コースは複数、特別コースは0件）。 */
export function extractCourseCodes(text: string): string[] {
  return text.match(/\d{4}[0-9A-Z]{3}/g) ?? []
}
