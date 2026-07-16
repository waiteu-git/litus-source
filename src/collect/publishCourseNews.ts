/**
 * 同期runで観測したコース増分を「LETUS新着」累積ストアへ転記し、必要なら即時ローカル通知する。
 * CourseUpdateEngine（同期・時間割の引っ張り更新の両起動点）から呼ぶ共通ヘルパ。
 * 渡すのは**このrunで実巡回したコースの差分のみ**（TTL保持中の古いaddedを再転記しないこと）。
 * 冪等性: 累積は活動URLで重複排除（applyRunDiffs）、通知は通知済みURL集合で再通知を抑止。
 * 通知/保存の失敗は握りつぶす（収集の成立を優先。掲示通知と同契約）。
 */
import { applyRunDiffs, pruneCourseNews, type AppendedNews, type CourseRunDiff } from '../updates/courseNews'
import { mutateCourseNews } from '../storage/courseNewsStore'
import { mutateNotifiedLetusNews } from '../storage/notifiedLetusNewsStore'
import { loadLetusNewsNotifySettings } from '../storage/letusNewsNotifySettingsStore'
import { buildLetusNewsContent, filterUnnotifiedNews } from '../notifications/letusNewsNotify'
import { capNotifiedIds, NOTIFIED_IDS_CAP } from './../notifications/bulletinNotify'
import { presentLetusNewsNotification } from '../notifications/notifier'

export async function publishCourseNews(runDiffs: CourseRunDiff[]): Promise<void> {
  const diffs = runDiffs.filter((d) => d.added.length > 0)
  try {
    const nowIso = new Date().toISOString()
    let appended: AppendedNews[] = []
    // 剪定（TTL14日）は差分ゼロのrunでも必ず実行する。差分が出た時だけ剪定すると、
    // 静かな期間（長期休暇等）に古い新着がホームカード/バッジへ居座り続ける。
    await mutateCourseNews((cur) => {
      const pruned = pruneCourseNews(cur, nowIso)
      if (diffs.length === 0) return pruned
      const r = applyRunDiffs(pruned, diffs, nowIso)
      appended = r.appended
      return r.next
    })
    if (appended.length === 0) return
    const settings = await loadLetusNewsNotifySettings()
    if (!settings.enabled) return
    // 通知済み集合は「通知前」の値で判定し、同じ mutate 内で今回分を登録する（lost update回避）。
    let notified: string[] = []
    await mutateNotifiedLetusNews((cur) => {
      notified = cur
      return capNotifiedIds([...cur, ...appended.map((a) => a.url)], NOTIFIED_IDS_CAP)
    })
    const content = buildLetusNewsContent(filterUnnotifiedNews(appended, notified))
    if (content) await presentLetusNewsNotification(content)
  } catch {
    // 転記/通知の失敗は無視（次回runで再評価される。収集自体は成立済み）。
  }
}
