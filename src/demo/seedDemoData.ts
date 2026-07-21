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
import { mutateLetusBody } from '../storage/letusBodyStore'
import { saveTermsConsent } from '../storage/termsConsentStore'
import { saveOnboardingDone } from '../storage/onboardingStore'
import {
  DEMO_TIMETABLE,
  DEMO_TERMS_CONSENT,
  buildDemoAssignments,
  buildDemoBulletins,
  buildDemoAttendanceStats,
  buildDemoClassEvents,
  buildDemoBodies,
} from './demoFixtures'

export async function seedDemoData(now: Date = new Date()): Promise<void> {
  // 同意・オンボーディングを先に済ませる（これが無いとデモに入っても同意画面から始まる）。
  await saveTermsConsent(DEMO_TERMS_CONSENT)
  await saveOnboardingDone()

  await saveTimetable(DEMO_TIMETABLE)
  // 日付を持つものは now 基準で生成する（固定日付だと審査時期に全部が過去になる）。
  await mutateAssignments(() => buildDemoAssignments(now))
  await mutateBulletinDigest(() => buildDemoBulletins(now))
  await saveAttendanceStats(buildDemoAttendanceStats(now))
  await saveClassEvents(buildDemoClassEvents(now))
  // 本文もシードする。無いと課題詳細で取得エンジンが立ち、デモでは取得できず
  // 「本文を取得できませんでした」で止まる（審査員が最初に開く画面）。
  await mutateLetusBody(() => buildDemoBodies(now))
}
