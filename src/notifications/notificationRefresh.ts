/**
 * 通知予約の唯一の入口。出席・課題締切前・朝まとめを一括で読み込み、
 * planNotifications で iOS 64枠へ優先度配分してから expo-notifications に貼り直す。
 * 個別に予約すると全体枠を協調できず出席ナッジが押し出されうるため、経路をここへ一本化する。
 * トリガー: アプリ起動時／時間割・課題の収集完了時／出席アラーム設定変更時。
 * 出席は N1（docs/design/2026-09-12-v11-train1-N1.md）で「同じ種類・同じ時刻は1通」「決まった identifier で差分同期」
 * 「受付open・出席済みと出席の直列キューで協調」になった。
 */
import { loadTimetable } from '../storage/timetableStore'
import { isDemoNamespace } from '../storage/asyncStorage'
import { loadAttendanceSettings } from '../storage/attendanceSettingsStore'
import {
  computeAttendanceAlarms,
  startOfLocalDay,
  todaySlotNotices,
  upcomingAttendanceNotices,
  type CancelledClass,
  type NoticeTitleContext,
} from './attendanceSchedule'
import { loadAssignments } from '../storage/assignmentsStore'
import { computeNotificationSchedule, type SchedulableAssignment } from './schedule'
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
// N1: 予約集合・予約項目（純粋層）と、出席の直列キュー・除外の材料。
import { planAttendanceNotices, toAttendanceScheduleItems } from './attendanceSync'
import { collectExcludedIds } from './attendanceOpenNotify'
import { enqueueAttendanceNotif, retractedFor } from './attendanceNotifState'
import { loadAnnouncedSlots } from '../storage/announcedSlotsStore'
import { loadAttendedRecord } from '../storage/attendanceDoneStore'
import { loadTimetableOverrides, loadCurrentQuarter } from '../storage/timetableOverridesStore'
import { resolveCurrentQuarter, type TimetableOverrides } from '../timetableEvents/quarter'
import { todayKey } from '../attendance/attendedState'

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
 * 出席の同期は、さらに出席の直列キュー（受付open・出席済みの取り下げと共有）の中で行う（N1 §4.5）。
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
      // 出席の出口も出席の直列キューを通す（受付open の提示〜記録と交錯させない）。
      // 片方が失敗しても、もう片方の全キャンセルへ進む（停止要請から24h以内に止める約束の出口を1本で止めない）。
      try {
        await enqueueAttendanceNotif(() => syncAttendanceAlarms([]))
      } catch (e) {
        console.warn('停止指示による出席アラームの取り消しに失敗しました', e)
      }
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
    // 🔴 N1: 今日の0:00から計算する（始まっている授業の終了前にも「授業の時間帯（span）」を持たせるため）。
    // 予約するのは now より後に鳴る枠だけ＝鳴る時刻の集合は now で計算した場合と同じ（§7-T1）。
    // 同じ種類・同じ時刻の出席は1枠にまとめる（積みコマ。科目は消さず、題名で並べる＝§4.1・撤回1）。
    const attendanceAlarms = collections
      ? computeAttendanceAlarms(collections, settings, startOfLocalDay(now), {}, cancelled, termInfo)
      : []
    const notices = upcomingAttendanceNotices(attendanceAlarms, now)
    // 受付open 済み・出席済みの照合に使う今日の枠（科目別OFF・休講・学期終了を通さない全科目＝§4.3）。
    const todayNotices = collections ? todaySlotNotices(collections, now) : []
    // 積みコマの題名の材料（§4.1）。読めなければ指定なし＝「A／B」に倒す（題名が変わるだけで、鳴る時刻は変わらない）。
    const manualQuarter = await loadCurrentQuarter().catch(() => null)
    const titleCtx: NoticeTitleContext = {
      overrides: await loadTimetableOverrides().catch(() => ({}) as TimetableOverrides),
      manualQuarter,
      resolvedQuarter: resolveCurrentQuarter(manualQuarter, now),
    }

    const assignmentMap = await loadAssignments()
    const assignmentNotifications = computeNotificationSchedule(toSchedulable(assignmentMap), now)

    const eventNotifications = classEventNotifications(classEvents, now)
    const others = [...assignmentNotifications, ...eventNotifications]

    // キューの中の計算が失敗した時の課題の配分（除外なし）。
    let assignmentsPlanned = planAttendanceNotices({ notices, others, now, excluded: new Set() }).assignments
    try {
      await enqueueAttendanceNotif(async () => {
        // 🔴 除外（受付open 済み＝M4・出席済み＝M5・取り下げ）はキューの中で読み直す（§4.5）。
        // キューの外で読むと、計算の後に割り込んだ受付open が取り消した開始アラームを、ここで貼り直してしまう。
        const today = todayKey(now)
        const [announced, attendedRec] = await Promise.all([
          loadAnnouncedSlots().catch(() => [] as string[]),
          loadAttendedRecord().catch(() => null),
        ])
        const excluded = collectExcludedIds({ announced, attendedRec, retracted: retractedFor(today), todayNotices, today })
        const plan = planAttendanceNotices({ notices, others, now, excluded })
        assignmentsPlanned = plan.assignments
        // 優先度配分の後にずらす（配分の判断は元の時刻で行うのが正しい）。まとめた後は同じ種類・同じ時刻が無いので、
        // 実際にずれるのは開始と終了前がたまたま同じ時刻になった時だけ。鍵は枠の id（ずらしても id は変わらない）。
        await syncAttendanceAlarms(
          toAttendanceScheduleItems(staggerSameInstant(plan.attendance, DEFAULT_STAGGER_STEP_MS, (n) => n.id), titleCtx),
        )
      })
    } catch (e) {
      // 出席の同期が失敗しても課題の同期へ進む（iOS の過去時刻の reject で、課題の古い予約が残っていた穴＝§3）。
      console.warn('出席アラームの同期に失敗しました（課題の同期へ進みます）', e)
    }
    // 当日イベントは全て8:00固定・同一締切の課題がミリ秒まで一致するため、ずらしてヘッドアップと音の重なりを解く。
    try {
      await syncAssignmentReminders(staggerSameInstant(assignmentsPlanned, DEFAULT_STAGGER_STEP_MS, assignmentStaggerKey))
    } catch (e) {
      console.warn('課題リマインドの同期に失敗しました', e)
    }
  },
)
