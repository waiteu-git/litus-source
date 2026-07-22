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
import { loadTimetableOverrides, loadCurrentQuarter } from '../storage/timetableOverridesStore'
import { applyQuarterOverrides, resolveCurrentQuarter } from '../timetableEvents/quarter'
import { loadTimetableRefreshedAt, loadAssignmentsRefreshedAt } from '../storage/refreshMetaStore'
import { buildWidgetModel, pickDataAt, type WidgetModel } from './viewModel'

/** 現在時刻でウィジェット表示モデルを組み立てる。読み取り失敗は空データにフォールバック。 */
export async function loadWidgetModel(now: Date = new Date()): Promise<WidgetModel> {
  const [timetable, assignmentMap, attended, weeklyPatterns, ttOverrides, ttQuarterPref, ttAt, asgAt] =
    await Promise.all([
      loadTimetable().catch(() => null),
      loadAssignments().catch((): AssignmentMap => ({})),
      loadAttendedRecord().catch(() => null),
      loadWeeklyPatterns().catch((): WeeklyPatternMap => ({})),
      loadTimetableOverrides().catch(() => ({})),
      loadCurrentQuarter().catch(() => null),
      // 鮮度ラベルは描画時刻ではなく「最後にLETUS/CLASSへ触った時刻」で出す（OSが30分ごとに
      // 起こす再描画では通信していないため、now を使うと存在しない鮮度を詐称する）。
      loadTimetableRefreshedAt().catch(() => 0),
      loadAssignmentsRefreshedAt().catch(() => 0),
    ])
  const isOn = (code: string) => isClassOnDate(weeklyPatterns[code], now)
  // 積みコマ（半期科目）の代表選択用に override をマージし、現在半期（手動指定優先・無ければ日付既定）を算出。
  const ttQ = (timetable ?? []).map((c) => ({ ...c, slots: applyQuarterOverrides(c.slots, ttOverrides) }))
  const cq = resolveCurrentQuarter(ttQuarterPref, now)
  return buildWidgetModel(now, ttQ, Object.values(assignmentMap), attended, isOn, cq, pickDataAt(ttAt, asgAt))
}
