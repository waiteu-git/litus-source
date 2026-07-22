/**
 * WebView画面での「戻る」の判定（純粋・RN非依存）。
 *
 * 実機報告(2026-07-22): Litus内でLETUSを見ているとき戻ると、ブラウザと違って
 * WebView内の履歴を1つ戻らず**画面ごと抜けて時間割まで一気に戻ってしまう**。
 * 原因は単純で、`BackHandler` も `canGoBack` もどの画面にも無く（grep 0件）、
 * ハードウェアバックが常に navigation の pop に直行していたこと。
 *
 * ブラウザと同じ体感にするには「WebView内で戻れるうちは WebView 内で戻る」。
 * 戻れなくなって初めて画面を閉じる。
 */
export type WebViewBackAction = 'webview' | 'screen'

/**
 * 戻るキーをどちらに割り当てるか。
 *
 * `loading` 中でも canGoBack が立っていれば WebView 側へ回す（読み込み途中で
 * 画面ごと閉じられると、ユーザーは「勝手に抜けた」と感じる）。
 */
export function webViewBackAction(s: { canGoBack: boolean }): WebViewBackAction {
  return s.canGoBack ? 'webview' : 'screen'
}
