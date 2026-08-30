import { describe, it, expect } from 'vitest'
import {
  DEMO_TIMETABLE,
  DEMO_TIMETABLE_OVERRIDES,
  DEMO_TERMS_CONSENT,
  buildDemoAssignments,
  buildDemoBulletins,
  buildDemoAttendanceStats,
  buildDemoClassEvents,
  buildDemoBodies,
} from './demoFixtures'
import {
  isQuarterSlot,
  applyQuarterOverrides,
  isDimmedForCurrentQuarter,
} from '../timetableEvents/quarter'
import { serializeTimetable, deserializeTimetable } from '../storage/timetableSerialize'
import { serializeAssignments, deserializeAssignments } from '../storage/assignmentsSerialize'
import { serializeBulletinDigest, deserializeBulletinDigest } from '../storage/bulletinDigestSerialize'
import {
  serializeAttendanceStats,
  deserializeAttendanceStats,
} from '../storage/attendanceStatsSerialize'
import { serializeClassEvents, deserializeClassEvents } from '../storage/classEventsSerialize'
import { serializeTermsConsent, deserializeTermsConsent } from '../storage/termsConsentSerialize'
import { TERMS_VERSION } from '../legal/termsVersion'
import { isUserManagedUrl } from '../assignments/assignmentOwnership'
import { courseTermEndsWithOwners, isCourseActiveOn } from '../attendance/courseOver'
import { dateToYmd } from '../timetableEvents/eventDateValue'

const NOW = new Date('2026-09-16T10:00:00+09:00') // 公開目標期（水曜）

/**
 * デモデータが既存の serialize 層を往復することを保証する。
 * ここが通らないデータを投入すると、**審査中にアプリがクラッシュする**。
 */
describe('デモデータの整合性', () => {
  it('時間割が serialize→deserialize を往復する', () => {
    expect(deserializeTimetable(serializeTimetable(DEMO_TIMETABLE))).toEqual(DEMO_TIMETABLE)
  })

  it('課題が serialize→deserialize を往復する', () => {
    const a = buildDemoAssignments(NOW)
    expect(deserializeAssignments(serializeAssignments(a))).toEqual(a)
  })

  it('掲示が serialize→deserialize を往復する', () => {
    const b = buildDemoBulletins(NOW)
    expect(deserializeBulletinDigest(serializeBulletinDigest(b))).toEqual(b)
  })

  it('出席統計が serialize→deserialize を往復する', () => {
    const data = { courses: buildDemoAttendanceStats(NOW), collectedAt: NOW.getTime() }
    expect(deserializeAttendanceStats(serializeAttendanceStats(data))).toEqual(data)
  })

  it('授業イベントが serialize→deserialize を往復する', () => {
    const e = buildDemoClassEvents(NOW)
    expect(deserializeClassEvents(serializeClassEvents(e))).toEqual(e)
  })

  it('規約同意が現行版で、デモ起動時に同意画面へ戻らない', () => {
    expect(DEMO_TERMS_CONSENT).toBe(TERMS_VERSION)
    expect(deserializeTermsConsent(serializeTermsConsent(DEMO_TERMS_CONSENT))).toBe(TERMS_VERSION)
  })

  it('実在の大学・システム名を含まない（5.2.2対策）', () => {
    const json = JSON.stringify({
      DEMO_TIMETABLE,
      a: buildDemoAssignments(NOW),
      b: buildDemoBulletins(NOW),
      s: buildDemoAttendanceStats(NOW),
      e: buildDemoClassEvents(NOW),
    })
    expect(json).not.toMatch(/東京理科|理科大|tus\.ac\.jp|letus|shibboleth/i)
  })

  it('デモ課題のURLが実在しないドメイン（RFC2606の .invalid）を指す', () => {
    for (const url of Object.keys(buildDemoAssignments(NOW))) {
      expect(url).toMatch(/^https:\/\/[a-z.]+\.invalid\//)
    }
  })

  it('デモ課題が「収集された課題」として扱われる（手動課題に分類されない）', () => {
    // 独自スキームだと isUserManagedUrl が true になり、詳細画面が
    // 「このアクティビティは自動収集の対象外です」になって本文も出ない。
    // アプリの主機能である自動収集が審査員に見えなくなる（実機で確認した事象）。
    for (const url of Object.keys(buildDemoAssignments(NOW))) {
      expect(isUserManagedUrl(url)).toBe(false)
    }
  })

  it('課題本文が全件シードされている（詳細画面が取得エラーにならない）', () => {
    const bodies = buildDemoBodies(NOW)
    for (const url of Object.keys(buildDemoAssignments(NOW))) {
      expect(bodies[url]?.description).toBeTruthy()
    }
  })
})

/**
 * **いつ審査されても中身が見える**ことの保証。
 * 固定日付だと審査時期には全件が過去になり、「該当する課題はありません」しか出ず、
 * Apple が 2.1 で要求する "full features and functionality" を満たせない。
 */
describe('デモデータの時期非依存性', () => {
  const CASES = [
    new Date('2026-09-16T10:00:00+09:00'),
    new Date('2027-01-05T23:30:00+09:00'),
    new Date('2026-12-31T09:00:00+09:00'),
    new Date('2027-04-04T00:10:00+09:00'), // 日曜・深夜
  ]

  for (const now of CASES) {
    it(`${now.toISOString()} 時点で未提出の課題が未来の締切を持つ`, () => {
      const list = Object.values(buildDemoAssignments(now)).filter(
        (a) => a.submissionStatus !== 'submitted',
      )
      expect(list.length).toBeGreaterThan(0)
      for (const a of list) {
        expect(new Date(a.deadline!).getTime()).toBeGreaterThan(now.getTime())
      }
    })

    it(`${now.toISOString()} 時点で授業イベントが未来にある`, () => {
      const events = buildDemoClassEvents(now)
      expect(events.length).toBeGreaterThan(0)
      const today = now.toISOString().slice(0, 10)
      for (const e of events) expect(e.date >= today).toBe(true)
    })

    it(`${now.toISOString()} 時点で出席セッションが過去にある`, () => {
      const stats = buildDemoAttendanceStats(now)
      expect(stats.length).toBeGreaterThan(0)
      const today = now.toISOString().slice(0, 10)
      for (const c of stats) {
        expect(c.sessions.length).toBeGreaterThan(0)
        for (const s of c.sessions) expect(s.date! <= today).toBe(true)
      }
    })
  }

  it('締切が近い順に danger / warn / 余裕 の3段が揃う（意味色の出し分けが見える）', () => {
    const now = new Date('2026-09-16T10:00:00+09:00')
    const ds = Object.values(buildDemoAssignments(now))
      .filter((a) => a.submissionStatus !== 'submitted')
      .map((a) => (new Date(a.deadline!).getTime() - now.getTime()) / 86400000)
      .sort((x, y) => x - y)
    expect(ds[0]).toBeLessThan(2) // 24〜48h以内
    expect(ds[1]).toBeGreaterThan(2)
    expect(ds[1]).toBeLessThan(7)
    expect(ds[2]).toBeGreaterThan(14)
  })

  it('提出済みの課題は過去の締切を持つ（提出済み表示が見える）', () => {
    const now = new Date('2026-09-16T10:00:00+09:00')
    const done = Object.values(buildDemoAssignments(now)).filter(
      (a) => a.submissionStatus === 'submitted',
    )
    expect(done.length).toBeGreaterThan(0)
    for (const a of done) expect(new Date(a.deadline!).getTime()).toBeLessThan(now.getTime())
  })

  it('全画面ぶんのデータが空でない（審査員が機能を見られる）', () => {
    const now = new Date('2026-09-16T10:00:00+09:00')
    expect(DEMO_TIMETABLE[0].slots.length).toBeGreaterThan(0)
    expect(Object.keys(buildDemoAssignments(now)).length).toBeGreaterThan(0)
    expect(buildDemoBulletins(now).length).toBeGreaterThan(0)
    expect(buildDemoAttendanceStats(now).length).toBeGreaterThan(0)
    expect(buildDemoClassEvents(now).length).toBeGreaterThan(0)
  })
})

/**
 * 審査員が実際に触る画面の「厚み」と、機能が露出しているかの保証。
 * 6コマ・5日ばらけ（最多の曜日でも2コマ）では画面下が大きく空き、
 * 積みコマが1つも無いと前半/後半トグルが一度も描画されない＝その機能を見せられない。
 */
describe('デモ時間割の密度と機能露出', () => {
  const slots = DEMO_TIMETABLE.flatMap((c) => c.slots)
  const allClasses = slots.flatMap((s) => s.classes)

  it('週12コマ以上ある（実在の大学の時間割として自然な密度）', () => {
    expect(slots.length).toBeGreaterThanOrEqual(12)
  })

  it('1日に3コマ以上入る曜日がある（縦に埋まって見える）', () => {
    const byDay = new Map<string, number>()
    for (const s of slots) byDay.set(s.day, (byDay.get(s.day) ?? 0) + 1)
    expect(Math.max(...byDay.values())).toBeGreaterThanOrEqual(3)
  })

  it('積みコマ（同一曜限2科目）が1つある（前半/後半トグルが描画される）', () => {
    // TimetableScreen は hasStacked = slots.some(isQuarterSlot) でしかトグルを出さない。
    // 積みが無いと審査員はリタス固有のクォーター機能を一度も見られない。
    expect(slots.filter(isQuarterSlot).length).toBe(1)
  })

  it('積みコマの2科目に前半/後半が指定されている（トグル操作で薄表示が実際に変わる）', () => {
    const stacked = slots.find(isQuarterSlot)!
    const qs = stacked.classes.map((c) => DEMO_TIMETABLE_OVERRIDES[c.courseCode]?.quarter)
    expect(qs).toContain('first')
    expect(qs).toContain('second')
  })

  it('半期指定はどちらか片方だけを薄くする（自動/前半/後半で見た目が変わる）', () => {
    const stacked = applyQuarterOverrides([slots.find(isQuarterSlot)!], DEMO_TIMETABLE_OVERRIDES)[0]
    for (const cur of ['first', 'second'] as const) {
      const dimmed = stacked.classes.filter((c) => isDimmedForCurrentQuarter(c.quarter, cur, true))
      expect(dimmed.length).toBe(1)
    }
  })

  it('全コマに時限表の時刻がある（グリッドの時刻が空欄にならない）', () => {
    for (const col of DEMO_TIMETABLE) {
      const periods = col.periodTimes?.periods ?? []
      for (const s of col.slots) {
        expect(periods.find((p) => p.period === s.period)).toBeTruthy()
      }
    }
  })

  it('科目コードは全て架空の DEMO 採番（実在の採番規則に寄せない）', () => {
    for (const c of allClasses) expect(c.courseCode).toMatch(/^DEMO\d{3}$/)
  })

  it('時間割の全科目に出欠データがある（科目詳細の「あと◯回休める」が全科目で見える）', () => {
    // 出欠が無い科目の科目詳細は中立の「記録なし」になり、落単ラインの数値UIが出ない。
    // 13科目中3科目にしか出欠が無いと、審査員が適当に1科目開いても機能に当たらない。
    const stats = buildDemoAttendanceStats(NOW)
    const withStats = new Set(stats.map((c) => c.courseCode))
    for (const c of allClasses) expect(withStats.has(c.courseCode)).toBe(true)
  })

  it('全科目の出欠に日付つきの回が2回以上ある（落単ラインが計算できる）', () => {
    for (const c of buildDemoAttendanceStats(NOW)) {
      expect(c.sessions.filter((s) => s.date).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('出欠統計の曜限が時間割と一致する（出席率画面と時間割が食い違わない）', () => {
    const has = (day: string, period: number, name: string) =>
      slots.some((s) => s.day === day && s.period === period && s.classes.some((c) => c.name === name))
    for (const c of buildDemoAttendanceStats(NOW)) {
      for (const s of c.slots) expect(has(s.day, s.period, c.courseName)).toBe(true)
    }
  })

  it('授業イベントの曜限が時間割と一致する（休講・教室変更が実在しないコマを指さない）', () => {
    const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    for (const e of buildDemoClassEvents(NOW)) {
      const day = DOW[new Date(`${e.date}T00:00:00`).getDay()]
      for (const p of e.periods) {
        expect(
          slots.some((s) => s.day === day && s.period === p && s.classes.some((c) => c.name === e.courseName)),
        ).toBe(true)
      }
    }
  })
})

describe('デモモードと学期終了判定', () => {
  // ストア審査用デモから出席バナー/FAB/送信フローが消えると審査ブロッカーになる。
  // デモの出欠は全回が過去日なので、学期終了判定に拾われないことを機械的に固定する。
  it('デモの科目は「学期終了」と判定されない（案内が消えない）', () => {
    const now = new Date('2026-09-16T10:00:00+09:00')
    const courses = buildDemoAttendanceStats(now)
    const { termEnds, nameOwners } = courseTermEndsWithOwners(courses, now)
    const dateKey = dateToYmd(now)
    for (const c of courses) {
      expect(
        isCourseActiveOn({
          courseCode: c.courseCode ?? '',
          courseName: c.courseName,
          dateKey,
          termEnds,
          nameOwners, calendar: null,
          extraPlans: [],
        }),
      ).toBe(true)
    }
  })
})
