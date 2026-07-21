/**
 * デモ名前空間へ架空データを投入する。
 *
 * **呼ぶ前に setDemoNamespace(true) しておくこと。** そうしないと実データを上書きする。
 * DemoProvider.enter() がその順序を守っている。
 *
 * 各ストアの save 関数を使うのは serialize 形式を二重管理しないため。
 * Storage は既にデモ名前空間を向いているので、そのまま呼べば `demo:` 側へ入る。
 */
import { saveTimetable } from '../storage/timetableStore'
import { mutateAssignments } from '../storage/assignmentsStore'
import { mutateBulletinDigest } from '../storage/bulletinDigestStore'
import { saveAttendanceStats } from '../storage/attendanceStatsStore'
import { saveClassEvents } from '../storage/classEventsStore'
import { saveTermsConsent } from '../storage/termsConsentStore'
import { saveOnboardingDone } from '../storage/onboardingStore'
import {
  DEMO_TIMETABLE,
  DEMO_ASSIGNMENTS,
  DEMO_BULLETINS,
  DEMO_ATTENDANCE_STATS,
  DEMO_CLASS_EVENTS,
  DEMO_TERMS_CONSENT,
} from './demoFixtures'

export async function seedDemoData(): Promise<void> {
  // 同意・オンボーディングを先に済ませる（これが無いとデモに入っても同意画面から始まる）。
  await saveTermsConsent(DEMO_TERMS_CONSENT)
  await saveOnboardingDone()

  await saveTimetable(DEMO_TIMETABLE)
  await mutateAssignments(() => DEMO_ASSIGNMENTS)
  await mutateBulletinDigest(() => DEMO_BULLETINS)
  await saveAttendanceStats(DEMO_ATTENDANCE_STATS)
  await saveClassEvents(DEMO_CLASS_EVENTS)
}
