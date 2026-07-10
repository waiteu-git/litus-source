import { classifyClassPage, type ClassPageSignal } from '../attendance/classifyClassPage'

/**
 * headless CLASS収集（時間割/掲示）で、現在ページのシグナルから「早期離脱すべきか」を決める純粋関数。
 *
 * 背景: 収集は classViewArbiter の使用権(collectActive)を取り、そのあいだ出席の持続WebViewに
 * CLASSを譲らせる。譲られている間は出席の自動受付検出が止まるため、収集が「これ以上CLASSに触れても
 * 無駄」な状態に居座ってロックを最大 OVERALL_TIMEOUT だけ抱え込むのは損（授業中の自動検出を阻害する）。
 * そこで出席安定化と同じ「実DOMマーカーで着地を判定」する方式を収集にも適用し、無駄なロック保持を断つ。
 *
 * - 'abort':  PC等の他画面と競合(conflict) / メンテナンス中 → 自動復帰では解けない。即座に収集を終えて
 *             アービタを解放し、出席にCLASSを明け渡す（次回起動/更新で再試行）。
 * - 'reboot': システムエラー(ViewExpired等) / SSOトークン失効 → WebViewを作り直してフォームを取り直す。
 * - 'continue': それ以外（ログイン/SSOリダイレクト中・スプラッシュ・ポータル・目的ページ）→ 従来の
 *             OPEN/COLLECT を続行（ログインはcookieで自動リダイレクトされ次のonLoadEndで再判定される）。
 */
export type CollectSignal = ClassPageSignal & {
  hasMaintenance?: boolean
  hasSsoStale?: boolean
}

export type CollectEarlyAction = 'continue' | 'abort' | 'reboot'

export function collectEarlyAction(s: CollectSignal): CollectEarlyAction {
  // メンテナンスは classifyClassPage の対象外なので先に見る（本文テキスト由来）。
  if (s.hasMaintenance) return 'abort'
  const kind = classifyClassPage(s)
  if (kind === 'conflict') return 'abort'
  if (kind === 'error' || s.hasSsoStale) return 'reboot'
  return 'continue'
}
