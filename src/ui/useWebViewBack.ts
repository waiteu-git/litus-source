import { useCallback, useRef, useState } from 'react'
import { BackHandler } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { webViewBackAction } from './webViewBack'
import type { WebViewInstance } from './GuardedWebView'

/**
 * WebView画面の「戻る」をブラウザと同じ体感にする。
 *
 * 戻れるうちは WebView 内で戻り、戻れなくなって初めて画面を閉じる。
 * これが無いと、LETUSを数ページ辿ったあとの1回の戻るで画面ごと抜けて
 * 「時間割まで一気に戻った」ように見える（実機報告 2026-07-22）。
 *
 * フォーカス中だけ購読する（裏の画面が戻るキーを横取りしないため）。
 */
export function useWebViewBack(ref: React.RefObject<WebViewInstance | null>) {
  const [canGoBack, setCanGoBack] = useState(false)
  // BackHandler のコールバックは登録時の値を掴むため、最新値は ref で渡す。
  const canGoBackRef = useRef(false)
  canGoBackRef.current = canGoBack

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (webViewBackAction({ canGoBack: canGoBackRef.current }) === 'webview') {
          ref.current?.goBack()
          return true // 画面は閉じない
        }
        return false // navigation に委ねる
      })
      return () => sub.remove()
    }, [ref]),
  )

  return { setCanGoBack }
}
