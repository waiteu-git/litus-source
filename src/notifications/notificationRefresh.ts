/**
 * 通知予約の唯一の入口。出席・課題締切前・朝まとめを一括で読み込み、
 * planNotifications で iOS 64枠へ優先度配分してから expo-notifications に貼り直す。
 * 個別に予約すると全体枠を協調できず出席ナッジが押し出されうるため、経路をここへ一本化する。
 * トリガー: アプリ起動時／時間割・課題の収集完了時／出席アラーム設定変更時。
 */
import { loadTimetable } from '../storage/timetableStore'
import { isDemoNamespace } from '../storage/asyncStorage'
import { loadAttendanceSettings } from '../storage/attendanceSettingsStore'
import { computeAttendanceAlarms, type CancelledClass } from './attendanceSchedule'
import { loadAssignments } from '../storage/assignmentsStore'
import { computeNotificationSchedule, type SchedulableAssignment } from './schedule'
import { planNotifications } from './notificationPlan'
import { syncAttendanceAlarms, syncAssignmentReminders } from './notifier'
import type { AssignmentMap } from '../storage/assignmentsSerialize'
import { loadClassEvents } from '../storage/classEventsStore'
import type { ClassEvent } from '../timetableEvents/classEvent'
// 変換は純粋層（classEventNotify）に置いてテストで固定する。このファイルはストア（AsyncStorage）を
// 引き込むため vitest から読めず、ここに変換を書くとテストの穴になる（実際にそれで文面が壊れていた）。
import { classEventNotifications } from './classEventNotify'
import { loadAttendanceStats } from '../storage/attendanceStatsStore'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
// 🔴 学年暦は kill switch と同じ status.json から来る。**予約通知の経路は killSwitch を
// 一度も参照していなかった**（2026-08-28 実測・参照0件）ので、ここで初めて配線する。
// loadKillSwitchCache は React 非依存の非同期読みなので、この層から呼べる。
// 取得できなければ null＝暦なし＝従来どおり（fail-open）。
import { loadKillSwitchCache } from '../storage/killSwitchStore'
// 🔴 kill switch の `disabled:["all"]` は React ツリーを停止画面に差し替えるが、**予約済みの
// ローカル通知はそのまま鳴り続ける**（出席・朝まとめは最長7日、課題締切は無期限）。停止要請から
// 24h以内に止める約束の穴だったので、予約の唯一の入口であるこの関門で止める。
// 判定は純粋層（notificationSuppress）に置く。このファイルは AsyncStorage を引き込むため
// vitest から読めず、ここに判定を書くとテストの穴になる。
// 設計: docs/design/2026-09-02-killswitch-notification-cancel.md
import { resolveNotificationSuppression } from './notificationSuppress'
import { APP_BUILD } from '../health/appBuild'
import { buildCourseTermInfo, type CourseTermInfo } from '../attendance/courseOver'
import { serializeRuns } from './serializeRuns'
import { staggerSameInstant, DEFAULT_STAGGER_STEP_MS } from './staggerFireAt'
import type { ScheduledNotification } from './schedule'

/** 同一時刻グループ内の並び順を決めるキー（決定論のため種別ごとに安定した識別子を使う）。 */
function assignmentStaggerKey(n: ScheduledNotification): string {
  if (n.kind === 'morning-digest') return `dig:${n.fireAt}`
  if (n.kind === 'class-event') return `evt:${n.eventId}`
  return `asg:${n.assignmentId}:${n.kind}`
}

function toSchedulable(map: AssignmentMap): SchedulableAssignment[] {
  return Object.values(map)
    .filter((a) => !a.ignored)
    .map((a) => ({
      id: a.url,
      title: a.title,
      deadline: a.deadline,
      submissionStatus: a.submissionStatus,
    }))
}


/**
 * 「学期の授業回が終わった科目」の判定材料を保存済みデータから読む。
 *
 * **読めなければ空＝「学期終了は不明」に倒す（fail-open）。** 出欠が未収集の端末
 * （新規インストール直後）で出席アラームが1件も鳴らなくなるほうが害が大きい。
 * ここで例外を投げると課題リマインダも含む予約全体が止まるので、握って従来どおりに戻す。
 */
async function loadCourseTermInfo(events: ClassEvent[], now: Date): Promise<CourseTermInfo> {
  try {
    const [stats, bulletins, ks] = await Promise.all([
      loadAttendanceStats(),
      loadBulletinDigest(),
      loadKillSwitchCache(),
    ])
    return buildCourseTermInfo({
      courses: stats?.courses ?? [], events, bulletins, now, calendar: ks?.status.calendar ?? null,
    })
  } catch {
    return { termEnds: {}, nameOwners: {}, extraPlans: [], calendar: null }
  }
}

/**
 * 直列化: 起動時/AppState復帰/収集完了/設定変更から多重発火するため、素のまま並走させると
 * getAllScheduled→cancel→再予約が非アトミックに交錯し二重予約・取りこぼしが起きる。
 * serializeRuns で1本ずつ実行し、実行中に重なった要求は完了後の1回に合流させる。
 */
export const refreshAllNotifications: (now?: Date) => Promise<void> = serializeRuns(
  async (now: Date = new Date()): Promise<void> => {
    // デモ中は OS の予約通知に触れない。触ると実ユーザーの出席アラーム・課題リマインダを
    // 全キャンセルして架空科目のものに差し替えてしまう（デモを抜けても再実行まで戻らない）。
    if (isDemoNamespace()) return
    // 全停止中は予約を残さない。⚠ kill の読みは学年暦（loadCourseTermInfo）の catch に
    // 相乗りさせない——あの catch は「読めなければ暦なし」に倒す設計で、混ぜると「停止指示が
    // 無い」と「読めなかった」が区別できなくなる。ここは独立した読みにして、倒す向き
    // （null も例外も fail-open。ただし例外は握り潰さず記録する）を自前で決める。
    // 出口は既存の同期2本だけで、どちらも空配列を渡せばタグ一致を全キャンセルする＝
    // **新しいキャンセルAPIは要らない**。出席・課題・各回イベントの計算より前で返すこと。
    const suppressed = await resolveNotificationSuppression(loadKillSwitchCache, APP_BUILD, (e) => {
      console.warn('停止指示の読み取りに失敗しました（予約は従来どおり継続します）', e)
    })
    if (suppressed) {
      await syncAttendanceAlarms([])
      await syncAssignmentReminders([])
      return
    }
    const collections = await loadTimetable()
    const settings = await loadAttendanceSettings()
    const classEvents = await loadClassEvents()
    // 休講登録済みのコマには出席アラームを出さない。渡さないと同じ日に「◯◯ 休講」と
    // 「◯◯ 出席コード」が両方届き、ホームの休講タグとも食い違う（2026-07-17修正）。
    const cancelled: CancelledClass[] = classEvents
      .filter((e) => e.type === 'cancel')
      .map((e) => ({
        date: e.date,
        periods: e.periods,
        courseCode: e.courseCode,
        courseName: e.courseName,
      }))
    // 学期の授業回が終わった科目には出席アラームを出さない。時間割は学期が終わってもコマを
    // 持ち続けるため、これを渡さないと前期終了後も毎週鳴り続ける（2026-08-03のユーザー報告）。
    // 画面（ホームのお知らせ・FAB）は2026-07-24に同じ述語を通したが、予約通知は素通りだった。
    const termInfo = await loadCourseTermInfo(classEvents, now)
    const attendanceAlarms = collections
      ? computeAttendanceAlarms(collections, settings, now, {}, cancelled, termInfo)
      : []

    const assignmentMap = await loadAssignments()
    const assignmentNotifications = computeNotificationSchedule(toSchedulable(assignmentMap), now)

    const eventNotifications = classEventNotifications(classEvents, now)

    const plan = planNotifications(attendanceAlarms, [...assignmentNotifications, ...eventNotifications], now)
    // 優先度配分の後にずらす（配分の判断は元の時刻で行うのが正しい）。
    // 当日イベントは全て8:00固定、同一締切の課題、同一曜限に積まれた別科目の出席開始が
    // ミリ秒まで一致するため、そのまま貼るとヘッドアップと音が重なって読めない。
    await syncAttendanceAlarms(
      staggerSameInstant(
        plan.attendance,
        DEFAULT_STAGGER_STEP_MS,
        (a) => `${a.courseCode}:${a.kind}`,
      ),
    )
    await syncAssignmentReminders(
      staggerSameInstant(plan.assignments, DEFAULT_STAGGER_STEP_MS, assignmentStaggerKey),
    )
  },
)
