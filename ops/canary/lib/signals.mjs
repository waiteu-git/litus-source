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

/** 出席: classifyClassPage によるマーカーチェック。件数概念が無いため drift はマーカー皆無で判定。 */
export function attendanceSignal(html, url, litus) {
  const root = parse(html)
  const sig = {
    hasPasswordInput: !!root.querySelector('input[type=password]'),
    hasAttendanceForm: /出席|attendance|shukketsu/i.test(html) && !!root.querySelector('form'),
    hasEnterSplash: false,
    hasClassMenu: false,
    hasSystemError: /システムエラー|ViewExpired|エラーが発生/i.test(html),
    hasMultiScreen: /複数の画面|別の画面で操作/i.test(html),
    url,
  }
  const kind = litus.classifyClassPage(sig)
  if (kind === 'attendance') return { status: 'ok', count: 1 }
  if (kind === 'login') return { status: 'not_logged_in' }
  if (kind === 'conflict' || kind === 'error') return { status: 'blocked' }
  // 出席URL着地・実描画・ログイン画面でないのに attendance と判定できない → 構造drift の疑い。
  if (litus.isAttendanceUrl(url) && bodyLen(root, html) >= 300 && !sig.hasPasswordInput) {
    return { status: 'structure_drift' }
  }
  return { status: 'blocked' }
}
