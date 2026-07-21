/**
 * アプリ内 WebView の唯一の出口。デモモード中は描画せず null を返す。
 *
 * なぜラッパーが要るか: リタスの通信は事実上すべて WebView 経由（大学のSSO・収集・
 * 出席送信）。デモモードは「ネットワークに一切出ない」ことが前提だが、収集エンジンは
 * 画面からも直接マウントされるため（掲示詳細を開くと本文取得エンジンが自動で立つ等）、
 * 呼び出し側に個別ガードを撒く方式では必ず取りこぼす。実際、最初の実装では App.tsx の
 * ツリー分岐と個別ガード4箇所で済ませた結果、7経路が素通りしていた。
 *
 * 生成点を1箇所に絞れば、新しいエンジンを足した人がガードを忘れても漏れない。
 * `src/ui/webViewGuard.test.ts` のラチェットが直接 import を禁止している。
 *
 * 注意: ここで null を返すと onMessage 等が永久に来ない。呼び出し側がタイムアウトを
 * 持たない場合「読み込み中」のまま止まるので、デモで到達しうる画面は
 * 別途デモ用の表示に分岐させること（例: SyllabusScreen）。
 */
import { forwardRef } from 'react'
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview'
import { isDemoNamespace } from '../storage/asyncStorage'

/** ref の型として使う（`useRef<WebViewInstance>(null)`）。 */
export type WebViewInstance = RNWebView

export const WebView = forwardRef<RNWebView, WebViewProps>(function GuardedWebView(props, ref) {
  // デモ中は WebView を1つも作らない＝通信ゼロを構造的に担保する。
  if (isDemoNamespace()) return null
  return <RNWebView ref={ref} {...props} />
})
