import { isSsoLoginUrl } from '../auth/classifyGatePage'

/** 非表示WebViewの現在ページ種別を判定し、エンジンの次の一手を決める（純粋）。 */
export interface ClassPageSignal {
  hasPasswordInput: boolean
  hasAttendanceForm: boolean
  hasEnterSplash: boolean
  hasClassMenu: boolean
  /**
   * 出席ページの「前の授業／次の授業」ナビの有無。**出席ページの全状態（受付中・受付なし・出席済み）に
   * 在り、リアペ提出ページには無い**（実DOM 3種で実測 2026-07-17）＝状態非依存の確実な着地判定。
   * フォーム（認証コード欄）は出席済みだと消え、URLは入場経路で変わる（Xut11301/Xut12401/Xua00101）ため、
   * この2つだけに頼ると出席済みページを portal と誤判定して navFailed に落ちる（実機バグの真因）。
   */
  hasAttendanceNav?: boolean
  hasSystemError: boolean
  /** 「複数の画面でご利用／別の画面で操作されました」＝PC等の他画面と競合（CLASSは同一セッション複数画面禁止）。 */
  hasMultiScreen?: boolean
  /** IdPの「過去のリクエスト」/CSRF＝SSOフローが壊れた状態。放置すると booting のまま navFailed に落ちるため、
   *  error と同様に「新しいWebViewで取り直す」対象にする（gate側は 'stale' で回復済み・出席側にも回復口が必要）。 */
  hasSsoStale?: boolean
  url?: string
}

export type ClassPageKind = 'attendance' | 'login' | 'splash' | 'portal' | 'error' | 'conflict' | 'other'

/**
 * 出席登録ページのURLか。**実測（2026-07-17・アドレスバー）で判明した実URL**:
 *   授業なし = /uprx/up/xu/xut113/Xut11301.xhtml ／ 授業あり = /uprx/up/xu/xut124/Xut12401.xhtml
 * 画面右上の `[Xua001]` は**機能IDであってURLではない**。旧実装は `/xua001|Xua00101/` を見ていたため
 * **実URLに一度も当たらず**、さらに `xua001` は**リアペ提出ページ(Xua00102)にだけ当たる**という逆転が
 * 起きていた（＝出席済みページが portal 誤判定→navFailed の一因）。
 * URLは入場経路で変わりうるので、これは補助。主判定は hasAttendanceNav（前の授業/次の授業）。
 * ディレクトリ(`xua001`)ではなく**ページ名で厳密一致**させ、リアペページを拾わないこと。
 */
export function isAttendanceUrl(url?: string): boolean {
  return /Xua00101|Xut11301|Xut12401/i.test(url ?? '')
}

export function classifyClassPage(s: ClassPageSignal): ClassPageKind {
  // SSO（Microsoft）ログインの初画面はパスワード欄が無いため、URLでも login を検知する
  if (s.hasPasswordInput || isSsoLoginUrl(s.url)) return 'login'
  // PC等の他画面と競合（複数の画面でご利用/別の画面で操作された）。自動やり直しでは解けないので
  // 専用表示＋PCが閉じるまで静かに再試行するため、システムエラーとは別verdictにする。
  if (s.hasMultiScreen) return 'conflict'
  // JSF ViewExpired等の「システムエラー」ページ／SSO stale（過去のリクエスト・CSRF）。どちらも
  // フローが壊れており、そのままでは出席ページに分類されず booting のまま navFailed に落ちる。
  // 'error' として自動復帰（新しいWebViewで一からSSOをやり直す）へ載せる。
  if (s.hasSystemError || s.hasSsoStale) return 'error'
  // 出席ページの着地判定。次のいずれかで確定する（1つに頼らない）:
  //  ・受付フォームあり＝受付中の授業あり（**出席済み/受付なしでは消える**）
  //  ・前の授業/次の授業ナビあり＝**出席ページの全状態で在る唯一の不変マーカー**（実DOM実測）
  //  ・実URL（入場経路で変わるため補助）
  // フォームとURLだけに頼っていたため、出席済みページ（フォーム消滅＋旧URL正規表現が不一致）が
  // portal に落ち、メニュー再遷移→着地せず→navTimeout→「受付状況を取得できませんでした」になっていた。
  if (s.hasAttendanceForm || s.hasAttendanceNav || isAttendanceUrl(s.url)) return 'attendance'
  // 入口スプラッシュはクリックではなくURL直遷移で入場するため portal（メニュー操作）と区別する
  if (s.hasEnterSplash) return 'splash'
  if (s.hasClassMenu) return 'portal'
  return 'other'
}
