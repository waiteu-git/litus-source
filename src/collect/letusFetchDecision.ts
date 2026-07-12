import { hasLetusLoginMarker } from '../health/collectionSignals'
import { isAssignmentPageUrl } from './injectedScripts'

/**
 * 非表示WebViewが送ってきた(html,url)から次の一手を決める純粋判定。
 * - パスワード欄などログインマーカーがあれば needsLogin（セッション切れ＝フォールバックへ）
 * - 課題ページURLに着地していれば body（parseAssignBody で抽出してよい）
 * - それ以外（SSOリダイレクト途中の中間ページ）は wait（次のonLoadEndを待つ）
 */
export function decideLetusFetch(html: string, url: string): 'body' | 'needsLogin' | 'wait' {
  if (hasLetusLoginMarker(html)) return 'needsLogin'
  if (isAssignmentPageUrl(url)) return 'body'
  return 'wait'
}
