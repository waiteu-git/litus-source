// 生HTML → 診断シグナル → CollectionHealth の写像。判定とパースは litus 再利用（loadLitus）。
// litus と同じ「壊れたか」の判定に載せるため、各面の診断フィールドを HTML から組み立てる。
import { parse } from 'node-html-parser'

const bodyLen = (root, html) => (root.querySelector('body')?.text || html).length
const hasLogout = (html) => (/ログアウト|logout/i.test(html) ? 1 : 0)
const pwdCount = (root) => root.querySelectorAll('input[type=password]').length

/** 掲示: dl.keiji 行数と tabArea から BulletinCollectDiag を作り bulletinHealth を再利用。 */
export function bulletinSignal(html, url, litus) {
  const root = parse(html)
  const rows = litus.parseBulletinList(html)
  const diag = {
    page: url,
    count: root.querySelectorAll('dl.keiji').length,
    tab: root.querySelector('.tabArea') ? 1 : 0,
    pwd: pwdCount(root),
    logout: hasLogout(html),
    blen: bodyLen(root, html),
  }
  return litus.bulletinHealth(litus.createHealthObservation(), diag, rows.length)
}

/** 時間割: table.classTable を parseTimetable に渡し、jigenArea 等から診断を作り timetableHealth を再利用。 */
export function timetableSignal(html, url, litus) {
  const root = parse(html)
  const table = root.querySelector('table.classTable')
  const slots = table ? litus.parseTimetable(table.outerHTML) : []
  const diag = {
    page: url,
    tableCount: root.querySelectorAll('table.classTable').length,
    hasJigen: !!root.querySelector('dd.jigenArea'),
    pwd: pwdCount(root),
    logout: hasLogout(html),
    blen: bodyLen(root, html),
  }
  return litus.timetableHealth(litus.createHealthObservation(), diag, slots.length)
}

/** LETUS課題1ページ: ログイン画面なら loginSeen、そうでなければ締切/提出状態を解析できたかで parsedOk。 */
export function letusPageStat(html, url, litus) {
  if (litus.hasLetusLoginMarker(html)) return { parsedOk: false, loginSeen: true }
  const p = litus.parseAssignmentPage(html, url)
  const parsedOk = !!p.deadline || (!!p.submissionStatus && p.submissionStatus !== 'unknown')
  return { parsedOk, loginSeen: false }
}

/** LETUS課題の巡回集計 → letusAssignmentsHealth（visited>=3 かつ parsedOk=0 で structure_drift）。 */
export function letusRunHealth(stats, litus) {
  return litus.letusAssignmentsHealth(stats)
}

/**
 * 出席: 件数概念が無いためマーカーチェック。出席モジュール(モバイル出席登録[Xua001]/Kmd008 等)へ
 * 到達できたかで判定する。受付中の授業が無くても「到達＝正常(ok)」。ログイン済・実描画なのに
 * 出席モジュールの痕跡が皆無なら構造drift。ログイン画面なら not_logged_in。
 */
export function attendanceSignal(html, url, litus) {
  const root = parse(html)
  const hasPwd = !!root.querySelector('input[type=password]')
  const loggedIn = /ログアウト|logout/i.test(html)
  // 出席セクション到達の痕跡（受付フォームの有無に依存しない）。
  const attendanceModule = /モバイル出席登録|出席登録|出席確認|xua001|kmd008/i.test(html)
  // ログイン画面が最優先（xua001 URL でも中身がログインなら未ログイン）。
  if (hasPwd && !loggedIn) return { status: 'not_logged_in' }
  // 出席セクションへ到達できていれば正常（受付中の授業が無くても ok）。
  // ポータルは隠しエラーダイアログのテンプレ文言を含むため classifyClassPage の error/conflict
  // 判定は生HTMLに対して誤検知する。到達痕跡を正とする。
  if (attendanceModule || litus.isAttendanceUrl(url)) return { status: 'ok', count: 1 }
  // 既知の非目的ページ（ポータル/SSO/入口）に留まった＝ナビ失敗の一時的失敗。
  // classifyCollectionHealth と同じ precedence（offTarget を drift より先に見る）。SSOログイン
  // ページに紛れる logout 文字列で loggedIn が誤って立っても、ここで blocked に落として偽drift化を防ぐ。
  if (litus.isKnownOffTargetPage(url)) return { status: 'blocked' }
  // ログイン済・実描画なのに出席モジュールの痕跡が皆無＝構造変更の疑い。
  if (loggedIn && bodyLen(root, html) >= 300) return { status: 'structure_drift' }
  return { status: 'blocked' }
}
