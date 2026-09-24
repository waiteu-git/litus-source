/**
 * アプリ内ストア評価依頼の OS 呼び出し。**expo-store-review を import してよい唯一のファイル**
 * （src/native/dormantNativeDeps.test.ts の ALLOW が固定している）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.6・実装者への禁止事項
 *
 * - 呼ぶのは useStoreReviewPrompt（ゲートが通った時の自動判定）だけ。ボタン等の操作からは呼ばない
 *   （Apple・Google とも不適切と明記）。依頼の前後に質問・独自ダイアログも出さない。
 * - `await import()` で遅延し、モジュールの評価（requireNativeModule）でアプリを落とさない。
 * - 表示されたかは OS が返さない。呼ぶ前に beforeRequest で記録する。記録できなければ呼ばない
 *   （保存が壊れているなら出さない側へ倒す）。
 */
export type StoreReviewOutcome = 'requested' | 'unavailable' | 'aborted' | 'error'

/**
 * @param beforeRequest 依頼の直前に呼ぶ。状態への記録と、最後の前面確認をここで行う。false で中止。
 */
export async function requestStoreReview(beforeRequest: () => Promise<boolean>): Promise<StoreReviewOutcome> {
  let StoreReview: typeof import('expo-store-review')
  try {
    StoreReview = await import('expo-store-review')
  } catch {
    return 'error'
  }
  try {
    // 利用できない環境（Play ストア無しの端末・サイドロード等）では記録もしない。
    if (!(await StoreReview.isAvailableAsync())) return 'unavailable'
  } catch {
    return 'error'
  }
  try {
    if (!(await beforeRequest())) return 'aborted'
  } catch {
    return 'error'
  }
  try {
    await StoreReview.requestReview()
    return 'requested'
  } catch {
    return 'error'
  }
}
