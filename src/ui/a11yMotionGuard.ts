/**
 * E0（v1.1 train1）のラチェットの判定部。React Native 非依存の純関数で、ファイルの走査はテスト側
 * （a11yMotionGuard.test.ts）に置く（rawColorGuard.ts と同じ分担）。
 * 保証するのは「呼んでいる」ことだけで「効いている」ことではない（効き目は設計 §8 の実機確認）。
 * 設計: docs/design/2026-09-12-v11-train1-E0.md §7 の R1〜R6。
 */

/** 行頭（空白を除く）が //・/*・* のどれかで始まる行をコメント行とみなす。 */
export function isCommentLine(line: string): boolean {
  const t = line.trimStart()
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')
}

/** コメント行を除いた行。 */
export function codeLines(text: string): string[] {
  return text.split('\n').filter((line) => !isCommentLine(line))
}

/** コメント行以外に needle（素の部分文字列）が現れるか。 */
export function codeHas(text: string, needle: string): boolean {
  return codeLines(text).some((line) => line.includes(needle))
}

/** コメント行以外で、識別子 name（英数字と _ だけ）を語境界つきで参照しているか。 */
export function codeRefers(text: string, name: string): boolean {
  const re = new RegExp(`\\b${name}\\b`)
  return codeLines(text).some((line) => re.test(line))
}

/** コメント行以外に callee（例 'disclosureA11yProps('）が現れる回数。 */
export function countCalls(text: string, callee: string): number {
  return codeLines(text).reduce((n, line) => n + line.split(callee).length - 1, 0)
}

/**
 * R1・R2 の型: triggers（例 Animated.loop の呼び出し）のどれかをコメント行以外に書いているのに、
 * required（例 shouldAnimateAmbient）をコメント行以外で参照していなければ違反（true）。
 * コメント行を数えないのは、spring.ts:21 の説明コメントを誤ブロックしないため。
 */
export function motionWiringViolation(text: string, triggers: readonly string[], required: string): boolean {
  return triggers.some((t) => codeHas(text, t)) && !codeRefers(text, required)
}

/**
 * R4: 読み上げで使ってはいけない書き方。見つかった断片を返す（無ければ []）。
 * - accessibilityRole="tab"／role="tab"＝RN 0.86 の iOS では役割が読まれない（F22）
 * - accessibilityState={{ … expanded … }} の直書き／aria-expanded＝iOS で英語の "expanded" が読まれる公算（F23）。
 *   開閉は disclosureA11yProps を通す。素の expanded: では探さない（pdfViewerHtml.ts に大量に当たり誤ブロックになる）。
 */
const FORBIDDEN_A11Y: readonly RegExp[] = [
  /accessibilityRole="tab"/g,
  /\brole="tab"/g,
  /accessibilityState=\{\{[^}]*\bexpanded\b[^}]*\}\}/g,
  /aria-expanded=/g,
]

export function findForbiddenA11y(text: string): string[] {
  const code = codeLines(text).join('\n')
  return FORBIDDEN_A11Y.flatMap((re) => code.match(re) ?? [])
}

/** marker（例 'export function Segmented'）から、次の行頭 export の直前までを切り出す。無ければ ''。 */
export function sliceFrom(text: string, marker: string): string {
  const i = text.indexOf(marker)
  if (i < 0) return ''
  const j = text.indexOf('\nexport ', i + marker.length)
  return j < 0 ? text.slice(i) : text.slice(i, j)
}

/** R4: 選択状態を accessibilityState={{ … selected … }} で渡しているか。 */
export function passesSelectedState(text: string): boolean {
  return /accessibilityState=\{\{[^}]*\bselected\b/.test(codeLines(text).join('\n'))
}

/** R5: 同期チップの固定ラベル（状態が読まれない名前）を書いているか。 */
export function hasFixedSyncLabel(text: string): boolean {
  return codeHas(text, 'accessibilityLabel="同期"')
}

/** R5: 掲示詳細のフラグに、両状態の名前（フラグを付ける／フラグを外す）を持つ accessibilityLabel があるか。 */
export function hasFlagLabel(text: string): boolean {
  const labels = codeLines(text).join('\n').match(/accessibilityLabel=\{[^}]*\}/g) ?? []
  return labels.some((l) => l.includes('フラグを付ける') && l.includes('フラグを外す'))
}

/** R6: 出典の無い C1 の数値（「約」＋15＋百分率記号、全角も）が現れるか。元はコメントにあったのでコメントも数える。 */
export function hasUnsourcedFifteen(text: string): boolean {
  return /約\s*15\s*[%％]/.test(text)
}
