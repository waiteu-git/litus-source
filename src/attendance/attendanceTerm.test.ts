import { describe, it, expect } from 'vitest'
import { resolveTermDates, termWeeksFromSessions, deriveExcludedDates } from './attendanceTerm'
import type { AttendanceSession, AttendanceCourseStats } from '../parsers/attendanceStats'
import { weekMondayKey } from '../timetableEvents/weeklyPattern'
import type { WeeklyPattern } from '../timetableEvents/weeklyPattern'
import { computeAttendanceRisk } from './attendanceRisk'

const S = (date: string | null, mark: AttendanceSession['mark'] = 'none'): AttendanceSession => ({ date, mark })

describe('resolveTermDates', () => {
  it('前期は全て同一年（now基準）に解決する', () => {
    const now = new Date(2026, 6, 16) // 2026-07-16
    const r = resolveTermDates([S('04/14'), S('05/12'), S('07/21')], now)
    expect(r.map((x) => x.full.getFullYear())).toEqual([2026, 2026, 2026])
    expect(r.map((x) => [x.full.getMonth() + 1, x.full.getDate()])).toEqual([
      [4, 14],
      [5, 12],
      [7, 21],
    ])
    expect(r.map((x) => x.date)).toEqual(['04/14', '05/12', '07/21'])
  })

  it('後期は12月→1月の折返しで年を+1する', () => {
    const now = new Date(2026, 10, 20) // 2026-11-20（後期）
    const r = resolveTermDates([S('10/06'), S('12/15'), S('01/12'), S('02/09')], now)
    expect(r.map((x) => x.full.getFullYear())).toEqual([2026, 2026, 2027, 2027])
  })

  it('年明け(1月)にnowがあっても後期の先頭(10月)は前年に解決する', () => {
    const now = new Date(2027, 0, 12) // 2027-01-12
    const r = resolveTermDates([S('10/06'), S('01/12')], now)
    expect(r[0].full.getFullYear()).toBe(2026)
    expect(r[1].full.getFullYear()).toBe(2027)
  })

  it('学期開始直前（先頭回が数日先の未来）でも当学期の年に当たる', () => {
    const now = new Date(2026, 3, 10) // 2026-04-10、先頭授業は04/13
    const r = resolveTermDates([S('04/13'), S('04/20')], now)
    expect(r[0].full.getFullYear()).toBe(2026)
    expect(r[0].full.getMonth() + 1).toBe(4)
  })

  it('空日付・非MM/DDは除外する', () => {
    const now = new Date(2026, 6, 16)
    const r = resolveTermDates([S('04/14'), S(null), S(''), S('あ')], now)
    expect(r.map((x) => x.date)).toEqual(['04/14'])
  })
})

describe('resolveTermDates: 基準年の反転（211 積み荷⑤ / docs/design/2026-09-03-attendance-year-inference.md）', () => {
  it('前期データ（初回04/10）をnow=2026-10-10に読んでも2026に解決する（回帰の本体）', () => {
    const now = new Date(2026, 9, 10) // 2026-10-10
    const r = resolveTermDates([S('04/10')], now)
    expect(r[0].full.getFullYear()).toBe(2026)
  })

  it('後期データ（初回09/11）をnow=2027-03-13に読んでも2026に解決する', () => {
    const now = new Date(2027, 2, 13) // 2027-03-13
    const r = resolveTermDates([S('09/11')], now)
    expect(r[0].full.getFullYear()).toBe(2026)
  })

  it('TOLERANCE境界: 先頭回がnowの13日先なら当年に解決する', () => {
    const now = new Date(2026, 0, 1) // 2026-01-01
    const r = resolveTermDates([S('01/14')], now) // 13日先
    expect(r[0].full.getFullYear()).toBe(2026)
  })

  it('TOLERANCE境界: 先頭回がnowの15日先なら前年に解決する', () => {
    const now = new Date(2026, 0, 1) // 2026-01-01
    const r = resolveTermDates([S('01/16')], now) // 15日先
    expect(r[0].full.getFullYear()).toBe(2025)
  })

  it('反転は授業期間の外（3月下旬の春休み）にしか来ない（反転が無いことは主張しない）', () => {
    // 前期データ（初回04/10）を2026-04-10から730日、1日ずつ走査する。
    const sessions = [S('04/10')]
    let prevYear: number | null = null
    const transitions: Date[] = []
    for (let i = 0; i <= 730; i++) {
      const now = new Date(2026, 3, 10)
      now.setDate(now.getDate() + i)
      const resolvedYear = resolveTermDates(sessions, now)[0].full.getFullYear()
      if (prevYear !== null && resolvedYear > prevYear) {
        transitions.push(new Date(now))
      }
      prevYear = resolvedYear
    }
    // 反転（解決年が増える日）は必ず起きる（§2.1: 消せない）。かつ授業期間の外＝3月下旬に限られる。
    expect(transitions.length).toBeGreaterThan(0)
    for (const t of transitions) {
      expect(t.getMonth() + 1).toBe(3)
      expect(t.getDate()).toBeGreaterThanOrEqual(20) // 3月下旬
    }
  })
})

describe('termWeeksFromSessions', () => {
  it('同一週の複数コマは1週に畳み、昇順ユニークの月曜Dateを返す', () => {
    const now = new Date(2026, 6, 16)
    // 月1金3: 04/13(月)と04/17(金)は同一週。翌週04/20(月)。
    const resolved = resolveTermDates([S('04/13'), S('04/17'), S('04/20')], now)
    const weeks = termWeeksFromSessions(resolved)
    expect(weeks).toHaveLength(2)
    expect(weeks.map((w) => weekMondayKey(w))).toEqual(['2026-04-13', '2026-04-20'])
    // 昇順
    expect(weeks[0].getTime()).toBeLessThan(weeks[1].getTime())
  })

  it('空入力は空配列', () => {
    expect(termWeeksFromSessions([])).toEqual([])
  })
})

describe('deriveExcludedDates', () => {
  const now = new Date(2026, 6, 16)
  const resolved = resolveTermDates([S('04/14'), S('04/21'), S('04/28'), S('05/12')], now)

  it('休み週に入る回の日付のみ返す', () => {
    const pattern: WeeklyPattern = { off: { '2026-04-20': true, '2026-05-11': true } } // 04/21と05/12の週
    expect(deriveExcludedDates(pattern, resolved).sort()).toEqual(['04/21', '05/12'])
  })

  it('空パターンは除外なし', () => {
    expect(deriveExcludedDates({}, resolved)).toEqual([])
  })

  it('週複数コマの同一週は各回の日付を返す（同一日付は1つ）', () => {
    const r2 = resolveTermDates([S('04/13'), S('04/17')], now) // 同一週(2026-04-13)の月・金
    const pattern: WeeklyPattern = { off: { '2026-04-13': true } }
    expect(deriveExcludedDates(pattern, r2).sort()).toEqual(['04/13', '04/17'])
  })
})

describe('統合: 隔週の幻の欠席を実施パターン除外で落単ラインから外す', () => {
  const now = new Date(2026, 6, 16)
  // 隔週火曜: 実施週=○ / 非実施週=×（毎週出席登録され幻の欠席になる）。
  const sessions: AttendanceSession[] = [
    S('04/14', 'present'),
    S('04/21', 'absent'), // 幻
    S('04/28', 'present'),
    S('05/05', 'absent'), // 幻
    S('05/12', 'present'),
    S('05/19', 'absent'), // 幻
  ]
  const stats: AttendanceCourseStats = {
    courseCode: '9960192',
    courseName: 'Reading and Writing',
    slots: [{ day: 'tue', period: 2 }],
    ratePercent: 50,
    sessions,
  }

  it('除外なしでは幻の×3が欠席に乗り危険（remaining<0）', () => {
    const r = computeAttendanceRisk(stats)
    expect(r.absent).toBe(3)
    expect(r.scheduledTotal).toBe(6)
    expect(r.allowedAbsences).toBe(2) // floor(6/3)
    expect(r.remaining).toBe(-1)
    expect(r.level).toBe('danger')
  })

  it('非実施週を休みにするとその×が分子・分母から消え、実態の欠席0になる', () => {
    // 幻の3週(04/21, 05/05, 05/19)を off に。
    const resolved = resolveTermDates(sessions, now)
    const off: Record<string, true> = {}
    for (const d of ['04/21', '05/05', '05/19']) {
      const full = resolved.find((x) => x.date === d)!.full
      off[weekMondayKey(full)] = true
    }
    const excludeDates = deriveExcludedDates({ off }, resolved)
    expect(excludeDates.sort()).toEqual(['04/21', '05/05', '05/19'])

    const r = computeAttendanceRisk(stats, { excludeDates })
    expect(r.absent).toBe(0) // 幻の×は除外
    expect(r.attended).toBe(3)
    expect(r.scheduledTotal).toBe(3) // 実施週3回のみが分母
    expect(r.remaining).toBe(r.allowedAbsences) // 欠席0＝上限まるまる残る
  })
})
