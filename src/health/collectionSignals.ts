/**
 * 収集別のシグナル集約（層2の入口・純粋・RN非依存）。
 * headless収集中に流れる page シグナル（DETECT_PAGE_JS）と、収集JSの最終ペイロード
 * （COLLECT_BULLETIN_TABS_JS / COLLECT_TIMETABLE_JS の診断フィールド）を
 * HealthSignals へ写像し classifyCollectionHealth へ渡す。
 */
import { classifyCollectionHealth, type CollectionHealth, type HealthSignals } from './collectionHealth'

/** 収集1回のあいだに観測した page シグナルの累積（一度trueになったら保持）。 */
export type HealthObservation = {
  passwordSeen: boolean
  maintenanceSeen: boolean
  conflictSeen: boolean
  loggedIn: boolean
  lastUrl: string
}

export function createHealthObservation(): HealthObservation {
  return { passwordSeen: false, maintenanceSeen: false, conflictSeen: false, loggedIn: false, lastUrl: '' }
}

/** ClassHeadlessCollector の onSignal に流れるメッセージを反映する。page 以外の type は無視。 */
export function observePageSignal(o: HealthObservation, p: Record<string, unknown>): void {
  if (p.type !== 'page') return
  if (p.hasPasswordInput === true) o.passwordSeen = true
  if (p.hasMaintenance === true) o.maintenanceSeen = true
  if (p.hasMultiScreen === true) o.conflictSeen = true
  if (p.hasLogout === true) o.loggedIn = true
  if (typeof p.url === 'string' && p.url) o.lastUrl = p.url
}

/** ログイン後ポータル(Xut124)/入口トップ/SSO＝目的ページ以外に留まった（ナビ失敗の疑い）。 */
export function isKnownOffTargetPage(urlOrPath: string): boolean {
  if (!urlOrPath) return true
  if (/xut124|shibboleth|login\.microsoftonline/i.test(urlOrPath)) return true
  // CLASS入口トップ（パス無し）。
  return /class\.admin\.tus\.ac\.jp\/?$/i.test(urlOrPath)
}

/** COLLECT_BULLETIN_TABS_JS の最終ペイロードの診断フィールド（届かなければ null）。 */
export type BulletinCollectDiag = {
  page?: string
  count?: number
  tab?: number
  pwd?: number
  logout?: number
  blen?: number
}

export function bulletinHealth(
  o: HealthObservation,
  c: BulletinCollectDiag | null,
  parsedCount: number,
): CollectionHealth {
  const page = c?.page || o.lastUrl
  const s: HealthSignals = {
    // コンテナ = タブ構造(tabArea)または dl.keiji 行そのもの。
    containerPresent: (c?.tab ?? 0) === 1 || (c?.count ?? 0) > 0,
    rawItemCount: c?.count ?? 0,
    parsedItemCount: parsedCount,
    maintenanceSeen: o.maintenanceSeen,
    conflictSeen: o.conflictSeen,
    passwordSeen: o.passwordSeen || (c?.pwd ?? 0) > 0,
    loggedIn: o.loggedIn || (c?.logout ?? 0) > 0,
    // 掲示は目的ページのパス(Bsd007)が実測済みなので、そこ以外に居たら未着地。
    offTarget: !/bsd007/i.test(page),
    bodyLength: c?.blen ?? 0,
  }
  return classifyCollectionHealth(s)
}

/** COLLECT_TIMETABLE_JS の最終ペイロードの診断フィールド（届かなければ null）。 */
export type TimetableCollectDiag = {
  page?: string
  tableCount?: number
  hasJigen?: boolean
  pwd?: number
  logout?: number
  blen?: number
}

export function timetableHealth(
  o: HealthObservation,
  c: TimetableCollectDiag | null,
  parsedSlotCount: number,
): CollectionHealth {
  // 時間割は目的ページのパス定数が未実測。既知の非目的ページ（ポータル/SSO/入口）に
  // 留まったときだけ offTarget とする（メニュー遷移の破綻は blocked に落ちる＝カナリアの担当）。
  const page = c?.page || o.lastUrl
  const s: HealthSignals = {
    containerPresent: (c?.tableCount ?? 0) > 0 || c?.hasJigen === true,
    rawItemCount: c?.tableCount ?? 0,
    parsedItemCount: parsedSlotCount,
    maintenanceSeen: o.maintenanceSeen,
    conflictSeen: o.conflictSeen,
    passwordSeen: o.passwordSeen || (c?.pwd ?? 0) > 0,
    loggedIn: o.loggedIn || (c?.logout ?? 0) > 0,
    offTarget: isKnownOffTargetPage(page),
    bodyLength: c?.blen ?? 0,
  }
  return classifyCollectionHealth(s)
}

/** LETUS課題巡回1回の集計。visited=onMessageが返ったページ数、parsedOk=締切or提出状態を解析できた数。 */
export type LetusRunStats = { visited: number; parsedOk: number; loginSeen: boolean }

/** これ以上のページ数を巡回して全滅なら構造ドリフトとみなす（少数の空振りは一時的失敗扱い）。 */
export const LETUS_DRIFT_MIN_PAGES = 3

export function letusAssignmentsHealth(r: LetusRunStats): CollectionHealth {
  if (r.loginSeen) return { status: 'not_logged_in' }
  if (r.visited === 0) return { status: 'empty_valid' } // 巡回候補なし＝新着なしの正常
  if (r.parsedOk > 0) return { status: 'ok', count: r.parsedOk }
  if (r.visited >= LETUS_DRIFT_MIN_PAGES) return { status: 'structure_drift' }
  return { status: 'blocked' }
}

/** LETUSのページHTMLがログイン画面（またはSSOリダイレクト断片）かどうか。 */
export function hasLetusLoginMarker(html: string): boolean {
  return /type=["']?password/i.test(html) || /login\.microsoftonline/i.test(html)
}
