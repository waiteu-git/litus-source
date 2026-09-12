/**
 * N1 の配線のラチェット（T15）。notifier.ts・notificationRefresh.ts・AttendanceEngineProvider.tsx・attendanceOpenFlow.ts は
 * expo / AsyncStorage / RN を引き込むため vitest から読めない＝配線の要点をソースで固定する（portalGuardWiring.test.ts と同じ形）。
 * 陰性の対照（旧形のソースでは検出される）を置く＝「見つからないから緑」を合格と読まない。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (...p: string[]) => readFileSync(join(__dirname, ...p), 'utf8')

/** `head` から次のトップレベル export までを切り出す（見つからなければ null）。 */
function exportedBody(src: string, head: string): string | null {
  const i = src.indexOf(head)
  if (i < 0) return null
  const j = src.indexOf('\nexport ', i + head.length)
  return src.slice(i, j < 0 ? undefined : j)
}

/** 出席の予約呼び出しが identifier を渡しているか。 */
function attendanceSchedulePassesIdentifier(notifierSrc: string): boolean {
  const b = exportedBody(notifierSrc, 'export async function syncAttendanceAlarms(')
  return !!b && b.includes('scheduleNotificationAsync({') && b.includes('identifier: item.id')
}

describe('🔴 出席の予約は決まった identifier で置き換える（N1 §4.2・T15）', () => {
  const notifier = read('notifier.ts')

  it('syncAttendanceAlarms の予約呼び出しは identifier を渡す', () => {
    expect(attendanceSchedulePassesIdentifier(notifier)).toBe(true)
  })

  it('判断は純粋層 syncAttendanceWith に置く（notifier で「全キャンセルして貼り直す」をしない）', () => {
    const b = exportedBody(notifier, 'export async function syncAttendanceAlarms(') ?? ''
    expect(b).toContain('syncAttendanceWith(')
    expect(b).not.toContain('差分管理せず')
  })

  it('課題の予約も1件ずつの try/catch（runScheduleLoop）を通し、10秒の窓は使わない（保留扱いにしない）', () => {
    // 課題は全部取り消した後に貼り直すので、isPending を真にすると10秒以内の1件が黙って消える（設計 §4.2・T8 の課題側）。
    const b = exportedBody(notifier, 'export async function syncAssignmentReminders(') ?? ''
    expect(b).toContain('runScheduleLoop(')
    expect(b).toContain('isPending: () => false')
  })

  it('陰性の対照: identifier を渡さない旧形（build 215）は検出される', () => {
    const old = [
      'export async function syncAttendanceAlarms(alarms: AttendanceAlarm[]): Promise<void> {',
      '  for (const alarm of alarms) {',
      '    await Notifications.scheduleNotificationAsync({',
      '      content: { title, body, data: { tag: ATTENDANCE_TAG } },',
      '    })',
      '  }',
      '}',
      'export async function syncAssignmentReminders() {}',
    ].join('\n')
    expect(attendanceSchedulePassesIdentifier(old)).toBe(false)
  })
})

describe('🔴 貼り直しの配線（N1 §4.2・§4.5）', () => {
  const refresh = read('notificationRefresh.ts')
  const at = (needle: string) => {
    const i = refresh.indexOf(needle)
    expect(i, `${needle} が notificationRefresh.ts に見つからない`).toBeGreaterThanOrEqual(0)
    return i
  }

  it('出席は今日の0:00から計算し、未来の枠だけを予約集合にする（T1 と同じ組み立て）', () => {
    at('computeAttendanceAlarms(collections, settings, startOfLocalDay(now), {}, cancelled, termInfo)')
    at('upcomingAttendanceNotices(attendanceAlarms, now)')
  })

  it('除外（受付open 済み・出席済み・取り下げ）は出席の直列キューの中で読み直してから配分する', () => {
    const queue = at('await enqueueAttendanceNotif(async () => {')
    expect(at('loadAnnouncedSlots()')).toBeGreaterThan(queue)
    expect(at('loadAttendedRecord()')).toBeGreaterThan(queue)
    expect(at('retractedFor(today)')).toBeGreaterThan(queue)
    expect(at('planAttendanceNotices({ notices, others, now, excluded })')).toBeGreaterThan(at('loadAnnouncedSlots()'))
  })

  it('出席の同期と課題の同期はそれぞれ try/catch で包む（出席が落ちても課題へ進む）', () => {
    const att = at('await syncAttendanceAlarms(')
    const asg = at('await syncAssignmentReminders(staggerSameInstant(')
    expect(refresh.lastIndexOf('try {', att)).toBeGreaterThan(at('const others = '))
    expect(refresh.slice(att, asg)).toMatch(/\} catch \(e\) \{[\s\S]*try \{/)
  })

  it('出席のずらしの鍵は枠の id（撤回1＝科目コードの鍵で積みコマを20秒ずらさない）', () => {
    at('staggerSameInstant(plan.attendance, DEFAULT_STAGGER_STEP_MS, (n) => n.id)')
    expect(refresh).not.toContain('`${a.courseCode}:${a.kind}`')
  })

  it('停止中の出席の出口も出席の直列キューを通す（空の配列＝出席タグを全部取り消す）', () => {
    at('await enqueueAttendanceNotif(() => syncAttendanceAlarms([]))')
  })

  it('陰性の対照: build 215 の組み立て（now で計算）では、期待する行が見つからない', () => {
    const old = 'const attendanceAlarms = collections\n  ? computeAttendanceAlarms(collections, settings, now, {}, cancelled, termInfo)\n  : []'
    expect(old.includes('computeAttendanceAlarms(collections, settings, startOfLocalDay(now), {}, cancelled, termInfo)')).toBe(false)
  })
})

describe('🔴 出席エンジンからの配線（N1 §4.3・§4.4・禁止事項5）', () => {
  const provider = read('..', 'attendance', 'AttendanceEngineProvider.tsx')
  const flow = read('attendanceOpenFlow.ts')
  const notifier = read('notifier.ts')

  it('受付open は流れのモジュールを経由する（提示を直接呼ばない）', () => {
    expect(provider).not.toContain('presentAttendanceOpenNotification')
    expect(provider).toContain('announceAttendanceOpen({')
  })

  it('出席済みの取り下げは、記録の3項目だけに依存する useEffect で行う', () => {
    expect(provider).toContain('retractAttendedSlots({ rec: attended, now: new Date() })')
    expect(provider).toContain('}, [attended?.date, attended?.courseName, attended?.confirmWindow])')
  })

  it('出席済みの分岐は今のまま（配信済みの受付open を消し、記録は fire-and-forget で保存）', () => {
    const branch = provider.slice(provider.indexOf("if (rec.status === 'attended') {"))
    expect(branch).toContain('clearDeliveredAttendanceOpenNotifications().catch(() => undefined)')
    expect(branch).toContain('saveAttendedRecord(arec).catch(() => undefined)')
  })

  it('受付open・取り下げとも、出席の直列キュー（enqueueAttendanceNotif）を渡す', () => {
    expect(flow.match(/enqueue: enqueueAttendanceNotif/g)?.length).toBe(2)
  })

  it('受付open の提示は identifier と音の有無を呼び出し側（純粋層）から受け取る', () => {
    const b = exportedBody(notifier, 'export async function presentAttendanceOpenNotification(') ?? ''
    expect(b).toContain('identifier: req.identifier')
    expect(b).toContain('sound: false')
  })

  it('陰性の対照: build 215 の配線（提示を直接呼ぶ・予約とは独立）は検出される', () => {
    const old = [
      "      if (rec.status === 'accepting') {",
      '            await presentAttendanceOpenNotification(buildAttendanceOpenContent(rec))',
      '            await clearDeliveredAttendanceStartNotifications(code).catch(() => undefined)',
    ].join('\n')
    expect(old.includes('presentAttendanceOpenNotification')).toBe(true)
    expect(old.includes('announceAttendanceOpen({')).toBe(false)
  })
})
