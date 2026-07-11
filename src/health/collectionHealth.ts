/**
 * 収集ヘルス判定（層2・純粋・RN非依存）。
 * CLASS/LETUSの収集が「本当に壊れたか」を観測シグナルから分類する。
 * フェーズ2の開発者カナリア(pi)が同じ判定を import する前提のため、
 * react / react-native / AsyncStorage への依存を絶対に持ち込まないこと。
 * 設計: docs/superpowers/specs/2026-07-11-collection-health-and-canary-design.md
 */

export type CollectionHealth =
  | { status: 'ok'; count: number }
  | { status: 'empty_valid' } // ページ正常・ログイン済・本当に0件
  | { status: 'structure_drift' } // 着地したのに期待コンテナ不在/行が1件も解析不能＝構造変更の疑い
  | { status: 'not_logged_in' }
  | { status: 'maintenance' }
  | { status: 'blocked' } // PC競合/未着地/タイムアウト等の一時的失敗

export type HealthSignals = {
  /** 期待コンテナ（掲示=tabArea/dl.keiji、時間割=table.classTable/dd.jigenArea）が存在したか */
  containerPresent: boolean
  /** コンテナ内のDOM上の行数（パース前） */
  rawItemCount: number
  /** パースに成功した行数 */
  parsedItemCount: number
  maintenanceSeen: boolean
  /** PC等の他画面との競合（複数の画面でご利用/別の画面で操作された）を観測したか */
  conflictSeen: boolean
  /** ログイン画面（password欄）を観測したか */
  passwordSeen: boolean
  /** ログイン済みの痕跡（ログアウトリンク等）を観測したか */
  loggedIn: boolean
  /** 最終観測ページが既知の非目的ページ（ポータル/SSO/入口）に留まった＝ナビ失敗の疑い */
  offTarget: boolean
  /** 最終観測ページの本文文字数（実質ページが描画されていたか） */
  bodyLength: number
}

/** これ未満の本文長は「実質ページが出ていない」（空白/エラー断片）とみなし drift 判定しない。 */
export const MIN_REAL_PAGE_BODY = 300

export function classifyCollectionHealth(s: HealthSignals): CollectionHealth {
  // 収集できたならそれが真実（途中でログイン画面やメンテ表示を経由していても成功が優先）。
  if (s.parsedItemCount > 0) return { status: 'ok', count: s.parsedItemCount }
  // 行はDOMに在るのに1件も解析できない＝行の内部構造が変わった疑い。
  if (s.containerPresent && s.rawItemCount > 0) return { status: 'structure_drift' }
  // コンテナは在って行0＝本当に0件。
  if (s.containerPresent) return { status: 'empty_valid' }
  if (s.maintenanceSeen) return { status: 'maintenance' }
  if (s.conflictSeen) return { status: 'blocked' }
  if (s.passwordSeen && !s.loggedIn) return { status: 'not_logged_in' }
  if (s.offTarget) return { status: 'blocked' }
  // 着地したはずのページが実質描画されているのにコンテナ不在＝セレクタ変更の疑い。
  if (s.loggedIn && s.bodyLength >= MIN_REAL_PAGE_BODY) return { status: 'structure_drift' }
  return { status: 'blocked' }
}
