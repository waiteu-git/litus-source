/**
 * 読み上げ（VoiceOver／TalkBack）の状態・名前・操作を決める純関数。React Native 非依存（vitest 可）。
 * RN への写像は disclosureA11y.ts（Platform を読む）、OS 設定の購読は useA11yFlag.ts が担う。
 * 設計: docs/design/2026-09-12-v11-train1-E0.md §4-1。語は §9-2 の承認済みの表から外さない。
 */

/** 最後に分かった OS 設定を1つ保持する（初期値 null＝まだ分からない）。メモリ上だけで、再起動で消える。 */
export type FlagCache = { get: () => boolean | null; set: (v: boolean) => void }

export function createFlagCache(): FlagCache {
  let value: boolean | null = null
  return {
    get: () => value,
    set: (v) => {
      value = v
    },
  }
}

/** iOS の開閉状態の読み上げ値（§9-2 で承認済みの2語）。RN の "expanded" は日本語訳が引けず英語で読まれる公算（F23）。 */
export const DISCLOSURE_VALUE_TEXT = { open: '展開中', closed: '折りたたみ中' } as const

export type DisclosureOs = 'ios' | 'android'

export type DisclosureA11y =
  | { readonly role: 'button'; readonly valueText: string }
  | { readonly role: 'button'; readonly expanded: boolean; readonly action: 'expand' | 'collapse' }

/**
 * 開閉の読ませ方を OS ごとに返す。iOS は値の文字（両状態とも日本語・expanded は渡さない＝F23）。
 * Android は expanded と、今の状態に合う操作を1つだけ（閉→expand／開→collapse＝F24）。値の文字は足さない（Q9）。
 */
export function disclosureA11y(os: DisclosureOs, open: boolean): DisclosureA11y {
  if (os === 'ios') {
    return { role: 'button', valueText: open ? DISCLOSURE_VALUE_TEXT.open : DISCLOSURE_VALUE_TEXT.closed }
  }
  return { role: 'button', expanded: open, action: open ? 'collapse' : 'expand' }
}

/** TalkBack の操作で開閉を切り替えるべきか。閉じている時の expand と、開いている時の collapse だけ true。 */
export function disclosureActionToggles(actionName: string, open: boolean): boolean {
  return (actionName === 'expand' && !open) || (actionName === 'collapse' && open)
}

/** 読み上げ名を「、」でつなぐ。空・null・undefined・false の部分は落とす。 */
export function joinA11yLabel(...parts: ReadonlyArray<string | null | undefined | false>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join('、')
}

/** RN の accessibilityActions に渡す形（名前と任意のラベル）。 */
export type A11yActionInfo = { readonly name: string; readonly label?: string }

/** 部品固有の追加操作（例: 見出しに入れ子になった「予定を追加」）。onAction は RN へは渡さず、受けた時に呼ぶ。 */
export type A11yExtraAction = { readonly name: string; readonly label: string; readonly onAction: () => void }

/** 開閉の操作（Android は1つ・iOS は0）の後ろへ追加操作を足す。base の並びと数は変えない。 */
export function mergeA11yActions(
  base: ReadonlyArray<A11yActionInfo>,
  extras: ReadonlyArray<A11yExtraAction>,
): A11yActionInfo[] {
  return [...base, ...extras.map(({ name, label }) => ({ name, label }))]
}

/** 受けた操作名に一致する追加操作（無ければ null）。 */
export function findExtraAction(actionName: string, extras: ReadonlyArray<A11yExtraAction>): A11yExtraAction | null {
  return extras.find((a) => a.name === actionName) ?? null
}
