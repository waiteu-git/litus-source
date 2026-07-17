import type { StoredHealth } from '../storage/collectionHealthSerialize'
import { formatSyncAgoShort } from './syncAgo'

/**
 * 出欠状況の取得状態を、ユーザーが自分で切り分けられる1行に文言化する（純粋・RN非依存）。
 *
 * なぜ専用関数か: 収集ヘルスは保存しているのに UI に出ておらず、「授業時間外でも取れない」の
 * 原因（競合／ログイン切れ／構造変化）をユーザーも開発者も確認できなかった（2026-07-18）。
 * バナー（healthBannerText）は ok/blocked/empty_valid を沈黙させるが、診断ではそれらも含めて
 * **常に何が起きているかを述べる**（前回成功時刻も併記して「いつのデータを見ているか」を示す）。
 */
export function attendanceStatsDiagLine(args: {
  health: StoredHealth['health'] | null
  /** 直近で取得に成功したepoch ms（0=未取得）。 */
  lastSuccessAt: number
  now: Date
}): string {
  const { health, lastSuccessAt, now } = args
  const ago = lastSuccessAt > 0 ? formatSyncAgoShort(lastSuccessAt, now) : null
  const lastPart = ago ? `前回取得: ${ago}` : null

  // 直近の収集が成功していれば、その事実と規模を出す。
  if (health?.status === 'ok') {
    return `取得できています（${lastPart ?? 'たった今'}・${health.count}科目）`
  }

  // 失敗・その他は理由を述べ、前回成功があれば併記する（何のデータを見ているか）。
  const withLast = (msg: string) => (lastPart ? `${msg}（${lastPart}）` : msg)

  switch (health?.status) {
    case 'blocked':
      // PC競合・未着地・タイムアウト。授業中の専有や一時的な読み込み失敗で、次の機会に自動再取得する。
      return withLast('取得に失敗しました（授業中の競合か、ページの読み込み未完了）。時間をおいて自動で取り直します')
    case 'not_logged_in':
      return withLast('CLASSのログインが切れています。アプリを開き直すと再ログインします')
    case 'structure_drift':
      return withLast('CLASSの画面構成が変わった可能性があります。表示は前回取得時点です')
    case 'maintenance':
      return withLast('CLASSがメンテナンス中です')
    case 'empty_valid':
      return withLast('対象の授業がありませんでした（異常ではありません）')
    default:
      // health なし＝この起動でまだ収集が完了していない。
      return lastPart
        ? `まだこの起動では取得していません（${lastPart}）`
        : 'まだ一度も取得できていません'
  }
}
