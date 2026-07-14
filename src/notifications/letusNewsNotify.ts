/**
 * LETUS新着（コース活動の増分）ローカル通知の純粋ロジック（RN非依存・テスト可能）。
 * 文面組み立てと通知済み除外を担う。端末I/O（即時提示/クリア）は notifier.ts、永続化は storage 層。
 * 初回ガードはスナップショット機構が内蔵（初回巡回は added=[]）なので diff 側の初回判定は不要。
 */
import type { AppendedNews } from '../updates/courseNews'

export type LetusNewsNotifySettings = { enabled: boolean }

export const DEFAULT_LETUS_NEWS_NOTIFY_SETTINGS: LetusNewsNotifySettings = { enabled: true }

/** 通知済み（活動URL）を除外する。 */
export function filterUnnotifiedNews(appended: AppendedNews[], notifiedIds: string[]): AppendedNews[] {
  const notified = new Set(notifiedIds)
  return appended.filter((a) => !notified.has(a.url))
}

/**
 * run単位の通知文面。0件は null（発火しない）。
 * 1コース1件=「コース名: 活動名」、1コース複数=「コース名: 新しい活動 N件」、
 * 複数コース=「LETUS新着 N件」＋先頭コース名 他Mコース。
 */
export function buildLetusNewsContent(items: AppendedNews[]): { title: string; body: string } | null {
  if (items.length === 0) return null
  const byCourse = new Map<string, AppendedNews[]>()
  for (const i of items) {
    const list = byCourse.get(i.courseUrl)
    if (list) list.push(i)
    else byCourse.set(i.courseUrl, [i])
  }
  if (byCourse.size === 1) {
    const list = [...byCourse.values()][0]
    const name = list[0].courseName || 'LETUSコース'
    if (list.length === 1) return { title: 'LETUSに新着', body: `${name}: ${list[0].title}` }
    return { title: 'LETUSに新着', body: `${name}: 新しい活動 ${list.length}件` }
  }
  const first = [...byCourse.values()][0][0]
  return {
    title: `LETUS新着 ${items.length}件`,
    body: `${first.courseName || 'LETUSコース'} 他${byCourse.size - 1}コース`,
  }
}
