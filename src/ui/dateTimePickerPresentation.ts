/**
 * 日付/時刻ピッカーの出し方（純粋・RN非依存＝vitestで固定できる）。
 *
 * `@react-native-community/datetimepicker` は **OSで描画のされ方が根本的に違う**:
 * - Android: モーダルのネイティブダイアログ。呼び出し側のレイアウトには何も足さない。
 * - iOS: **ビュー階層にインラインで埋め込まれる**。`display` 未指定だと iOS 14+ は `compact`
 *   ＝日付チップがフォーム内に常駐し、押して初めてカレンダーが開く。
 *
 * この差を意識せず「Android で正しく見える書き方」をすると、iOS では
 * 「自前の欄＋常駐チップ」の二重表示になる（実機 206 の症状）。
 * 分岐をここに1箇所だけ持ち、画面側では `Platform.OS === 'ios'` を書かない。
 */

export type PickerPresentation =
  /** ネイティブのダイアログが自分で開閉する。マウントするだけでよい。 */
  | 'nativeDialog'
  /** インラインに埋まるので、自前モーダルに入れて spinner 表示にし、閉じる操作を用意する。 */
  | 'modalSpinner'

/** `Platform.OS` を受け取り、その OS でのピッカーの出し方を返す。 */
export function pickerPresentation(os: string): PickerPresentation {
  // 未知のOSは「インラインに常駐する」側を既定にしない＝表示が壊れても操作は成立する方へ倒す。
  return os === 'ios' ? 'modalSpinner' : 'nativeDialog'
}
