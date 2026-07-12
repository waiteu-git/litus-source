/**
 * ウィジェット描画用のデータ供給。AsyncStorage の各ストアを直読し（ヘッドレス JS でもアプリ停止中でも動く）、
 * 純関数 buildWidgetModel に渡して表示モデルを得る。通信は一切行わない（キャッシュ表示のみ）。
 * ネイティブ/ストア依存があるためこの層は vitest 対象外。判断ロジックは viewModel.ts（純関数）側に寄せている。
 */
import { loadTimetable } from '../storage/timetableStore'
import { loadAssignments } from '../storage/assignmentsStore'
import { loadAttendedRecord } from '../storage/attendanceDoneStore'
import { loadWeeklyPatterns } from '../storage/weeklyPatternStore'
import type { WeeklyPatternMap } from '../storage/weeklyPatternSerialize'
import type { AssignmentMap } from '../storage/assignmentsSerialize'
import { isClassOnDate } from '../timetableEvents/weeklyPattern'
import { buildWidgetModel, type WidgetModel } from './viewModel'

/** 現在時刻でウィジェット表示モデルを組み立てる。読み取り失敗は空データにフォールバック。 */
export async function loadWidgetModel(now: Date = new Date()): Promise<WidgetModel> {
  const [timetable, assignmentMap, attended, weeklyPatterns] = await Promise.all([
    loadTimetable().catch(() => null),
    loadAssignments().catch((): AssignmentMap => ({})),
    loadAttendedRecord().catch(() => null),
    loadWeeklyPatterns().catch((): WeeklyPatternMap => ({})),
  ])
  const isOn = (code: string) => isClassOnDate(weeklyPatterns[code], now)
  return buildWidgetModel(now, timetable ?? [], Object.values(assignmentMap), attended, isOn)
}
