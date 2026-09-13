// 別画面（SubjectSchedule）を focus 付きで開いた時の初期スクロール判定（純粋ロジック）。

export type FocusScrollState = {
  /** 直近で自動スクロールした時の目標セクションの y（まだ自動スクロールしていなければ null）。 */
  lastY: number | null
  /** ユーザーが手動でスクロールしたか。true になったら以後は自動追従しない。 */
  userScrolled: boolean
}

export const initialFocusScrollState: FocusScrollState = { lastY: null, userScrolled: false }

/**
 * onLayout で測り直した目標セクションの y に対し、自動スクロールすべきかを決める。
 *
 * **「最初に測れた y で確定」にしてはいけない理由**: 出欠・実施パターンのデータは AsyncStorage から
 * 初回レイアウトより後に届く。到着前の出欠カードは案内文1本ぶんの高さしかなく、その下にある実施
 * パターンカードの y は本来より数百pt小さい値で測れる。到着後に出欠カードが膨らむ（統計2行＋各回
 * リスト＋ステッパー）と実施パターンカードは下へ動くため、一度きりの確定では focus:'pattern' が
 * 出欠の各回リストの途中に着地してしまう。そこで「ユーザーがまだ手動スクロールしていない間は、
 * 目標セクションの y が変わるたびに追従する」ことでレイアウト確定後に自動で補正をかける。
 *
 * @param targetY 目標セクションの y。null は「まだ計測できていない」（次の onLayout で再試行される）。
 * @param offset  セクション上端の少し上に余白を残すための引き算量。
 * @returns スクロール不要なら null。必要なら scrollTo（実際にスクロールする y）と lastY（記録する測定値）。
 */
export function nextFocusScroll(
  state: FocusScrollState,
  targetY: number | null,
  offset = 12,
): { scrollTo: number; lastY: number } | null {
  if (state.userScrolled) return null // 手動操作が入った後に画面を奪わない
  if (targetY === null) return null // 未計測
  if (state.lastY === targetY) return null // 同じ位置へ二重にスクロールしない
  return { scrollTo: Math.max(0, targetY - offset), lastY: targetY }
}
