/**
 * 「テキスト入力を持つ画面で、キーボードが出ると操作対象へ到達できなくなる」欠陥を
 * 静的に検出する純粋ロジック（依存ゼロ）。
 *
 * 背景: 出席画面は認証コード入力欄の**下**に送信CTAがあるのに、スクロールも
 * キーボード退避も一切無かった（`KeyboardAvoidingView` は全リポジトリで0件）。
 * 受付時間に追われる動線で送信ボタンへ指が届かない、という最悪の形で表面化する。
 *
 * これは実機でしか目視できず、テレメトリも無い＝**見なかったものは公開後も永久に見えない**。
 * したがって規約ではなくラチェットで縛る（§3.3「強制したものだけが浸透した」）。
 *
 * 要求する3点は、それぞれ別の詰み方に対応する:
 *
 * 1. スクロール可能な器（ScrollView / FlatList）
 *    Android は `softwareKeyboardLayoutMode: 'resize'` で window 自体が縮むため、
 *    スクロールが無いと**はみ出した分がそのまま切り落とされる**。
 *
 * 2. `keyboardShouldPersistTaps`
 *    既定（'never'）ではキーボード表示中の最初のタップが dismiss に食われ、CTA には届かない。
 *    2タップ必要になる＝受付終了間際に1タップ分を損する。
 *
 * 3. `automaticallyAdjustKeyboardInsets`（iOS のみ有効・Android では無視される）
 *    iOS は window が縮まないのでキーボードが本文に**被さる**。contentInset を足さない限り、
 *    スクロールしても隠れたCTAは出てこない＝**完全に詰む**。RN 0.70+ の標準プロパティで、
 *    `KeyboardAvoidingView` を持ち込まずにこれだけで解ける。
 *
 * **これは必要条件でしかない**。「実際に指が届くか」は端末サイズと状態の組み合わせに依るので、
 * 緑でも実機確認（受付中・必須リアペ・任意リアペ・出席済の4状態）は省略できない。
 */

/** 画面が満たすべき要件。欠けているものを `missing` に返す。 */
export type KeyboardEscapeRequirement =
  | 'scrollable'
  | 'keyboardShouldPersistTaps'
  | 'automaticallyAdjustKeyboardInsets'

export type KeyboardEscapeReport = {
  /** JSX として TextInput を描画しているか（import しているだけは対象外）。 */
  usesTextInput: boolean
  missing: KeyboardEscapeRequirement[]
}

/** JSX の要素開始タグ。`<TextInput` の直後は `>`・空白・改行のいずれか（`<TextInputFoo` を除く）。 */
function rendersElement(source: string, tag: string): boolean {
  return new RegExp(`<${tag}(?![A-Za-z0-9_])`).test(source)
}

/**
 * 1ファイル分の source を監査する。TextInput を描画していない画面は常に `missing: []`。
 */
export function auditKeyboardEscape(source: string): KeyboardEscapeReport {
  if (!rendersElement(source, 'TextInput')) return { usesTextInput: false, missing: [] }
  const missing: KeyboardEscapeRequirement[] = []
  // FlatList / SectionList も RN 内部は ScrollView なので同じ器として扱う。
  const scrollable =
    rendersElement(source, 'ScrollView') ||
    rendersElement(source, 'FlatList') ||
    rendersElement(source, 'SectionList')
  if (!scrollable) missing.push('scrollable')
  if (!source.includes('keyboardShouldPersistTaps')) missing.push('keyboardShouldPersistTaps')
  if (!source.includes('automaticallyAdjustKeyboardInsets')) {
    missing.push('automaticallyAdjustKeyboardInsets')
  }
  return { usesTextInput: true, missing }
}
