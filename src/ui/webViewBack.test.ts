import { describe, it, expect } from 'vitest'
import { webViewBackAction } from './webViewBack'

describe('webViewBackAction', () => {
  // 実機報告(2026-07-22): LETUSを数ページ辿ったあと戻ると、WebView内で1つ戻らず
  // 画面ごと抜けて時間割まで一気に戻る。BackHandler も canGoBack も全画面で0件だった。
  it('WebView内で戻れるなら WebView 内で戻る（ブラウザと同じ体感）', () => {
    expect(webViewBackAction({ canGoBack: true })).toBe('webview')
  })
  it('戻れなくなって初めて画面を閉じる', () => {
    expect(webViewBackAction({ canGoBack: false })).toBe('screen')
  })
})
