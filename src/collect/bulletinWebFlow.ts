/**
 * 方式B（可視WebViewでCLASS本物ページを開く掲示画面）の遷移を状態駆動にする純粋関数。
 *
 * 背景（このバグの根本原因）: 旧実装は onLoadEnd（ページ読込のたび）に ENTER→掲示メニュー→掲示
 * オープンの3タイマーを無条件で積んでいた。CLASSはSSO/postbackで何度もページを読み込むため、
 * タイマーが重なって多重 postback を撃ち、掲示モーダルを開く操作と交錯して CLASS の ViewState が
 * 競合 →「別の画面で操作されました」を毎回誘発していた。ClassHeadlessCollector の着地ガードと
 * 同じ発想で、現在ページを判定して「次の一手」を冪等に一つだけ返すことで多重 postback を断つ。
 */
export interface BulletinWebSignal {
  /** 入口スプラッシュ（PC版ENTER）に居るか */
  hasEnterSplash: boolean
  /** 掲示一覧ページ（Bsd007）に着地しているか */
  onBulletinPage: boolean
  /** 掲示詳細モーダルが既に開いているか */
  modalOpen: boolean
  /** 対象掲示を開く操作（openDetail）を既に一度撃ったか */
  detailFired: boolean
  /** ログイン画面（password欄）か */
  hasPasswordInput: boolean
  /** PC等の他画面と競合（別の画面で操作された/複数の画面でご利用） */
  hasMultiScreen: boolean
}

export type BulletinWebStep = 'enter' | 'openMenu' | 'openDetail' | 'idle'

/**
 * 現在ページから「次に一度だけ実行すべき一手」を返す。onLoadEnd 毎の無条件注入を廃し、
 * これで判定した一手だけを冪等に注入することで多重 postback（＝競合）を防ぐ。
 */
export function nextBulletinWebStep(s: BulletinWebSignal): BulletinWebStep {
  // 競合/ログインは再注入すると悪化する（可視ページなのでユーザー操作に委ねる）。最優先で idle。
  if (s.hasMultiScreen || s.hasPasswordInput) return 'idle'
  // 掲示ページに着いたら対象掲示を一度だけ開く。モーダル既開・実行済みは何もしない。
  if (s.onBulletinPage) {
    if (s.modalOpen || s.detailFired) return 'idle'
    return 'openDetail'
  }
  // まだ掲示ページ手前。入口スプラッシュなら入場、ログイン後ポータルなら掲示メニューを開く。
  if (s.hasEnterSplash) return 'enter'
  return 'openMenu'
}
