import { open } from '../lib/browser.mjs'
import { letusPageStat, letusRunHealth } from '../lib/signals.mjs'

const ORIGIN = 'https://letus.ed.tus.ac.jp'
const COURSES = `${ORIGIN}/my/courses.php`
const MAX_COURSES = 3 // pi 負荷を抑える巡回上限
const MAX_ACTIVITIES = 3

/**
 * LETUS課題の巡回は2ホップ: my/courses.php → 各 course/view.php → mod/assign 等の活動ページ。
 * courses.php が実描画・ログイン済なのに parseMyCourses が0件なら course 一覧側の drift。
 * 活動ページを visited/parsedOk で集計し letusAssignmentsHealth に渡す（visited>=3 かつ
 * parsedOk=0 で structure_drift）。
 */
export async function probe(ctx, litus) {
  const top = await open(ctx, COURSES)
  if (litus.hasLetusLoginMarker(top.html)) {
    return { surface: 'letus', health: { status: 'not_logged_in' }, html: top.html }
  }
  const courses = litus.parseMyCourses(top.html, ORIGIN)
  if (courses.length === 0) {
    // ログイン済で実描画なのにコース0件 = コース一覧の構造変更の疑い。
    if (top.bodyLen >= 2000) {
      return { surface: 'letus', health: { status: 'structure_drift' }, html: top.html }
    }
    return { surface: 'letus', health: { status: 'blocked' }, html: top.html }
  }

  // 各コースを開いて活動リンク（assign/quiz等）を集める。
  const activityUrls = []
  for (const c of courses.slice(0, MAX_COURSES)) {
    const cp = await open(ctx, c.url)
    for (const link of litus.extractLinksFromHtml(cp.html, ORIGIN)) {
      if (litus.isTargetActivityUrl(link.url, 'standard') && !activityUrls.includes(link.url)) {
        activityUrls.push(link.url)
      }
    }
    if (activityUrls.length >= MAX_ACTIVITIES) break
  }

  const stats = { visited: 0, parsedOk: 0, loginSeen: false }
  let lastHtml = top.html
  for (const url of activityUrls.slice(0, MAX_ACTIVITIES)) {
    const { html, url: landed } = await open(ctx, url)
    lastHtml = html
    const s = letusPageStat(html, landed, litus)
    stats.visited++
    if (s.loginSeen) {
      stats.loginSeen = true
      break
    }
    if (s.parsedOk) stats.parsedOk++
  }
  return { surface: 'letus', health: letusRunHealth(stats, litus), html: lastHtml }
}
