import { parseAcademicCalendar } from '../health/academicCalendar'
import { describe, expect, it } from 'vitest'
import {
  buildCourseTermInfo,
  courseTermEndsWithOwners,
  extraPlansFromCandidates,
  extraPlansFromEvents,
  isCourseActiveOn,
} from './courseOver'
import type { AttendanceCourseStats, AttendanceSession } from '../parsers/attendanceStats'
import type { ClassEvent, ClassEventType } from '../timetableEvents/classEvent'
import type { BulletinEventCandidate } from '../timetableEvents/bulletinEvents'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { parseBulletinDetail } from '../parsers/bulletinDetail'
import { DETAIL_MAKEUP } from '../parsers/__fixtures__/loadEventDetails'

const NOW = new Date(2026, 6, 14) // 2026-07-14

function sessions(dates: (string | null)[]): AttendanceSession[] {
  return dates.map((date) => ({ date, mark: 'none' as const }))
}

function course(o: Partial<AttendanceCourseStats> & { courseName: string }): AttendanceCourseStats {
  return {
    courseCode: '1234567',
    slots: [{ day: 'mon', period: 1 }],
    ratePercent: null,
    sessions: sessions(['04/13', '04/20', '07/20']),
    ...o,
  }
}

function ev(o: Partial<ClassEvent> & { type: ClassEventType; date: string }): ClassEvent {
  return {
    id: `e-${o.type}-${o.date}`,
    courseName: '情報リテラシー演習',
    courseCode: '1234567',
    periods: [1],
    room: null,
    note: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...o,
  }
}

describe('courseTermEndsWithOwners', () => {
  it('各回の MM/DD から最終授業日を YYYY-MM-DD で起こす', () => {
    const { termEnds: ends } = courseTermEndsWithOwners([course({ courseName: '情報リテラシー演習' })], NOW)
    expect(ends['1234567']).toBe('2026-07-20')
  })

  it('科目コードと科目名の両方を鍵にする（コードで引けない経路のため）', () => {
    const { termEnds: ends } = courseTermEndsWithOwners([course({ courseName: '情報リテラシー演習' })], NOW)
    expect(ends['情報リテラシー演習']).toBe('2026-07-20')
  })

  it('12月→1月の年跨ぎを解決する', () => {
    const { termEnds: ends } = courseTermEndsWithOwners(
      [course({ courseName: '後期科目', courseCode: '7654321', sessions: sessions(['10/02', '12/25', '01/22']) })],
      new Date(2026, 10, 1),
    )
    expect(ends['7654321']).toBe('2027-01-22')
  })

  it('日付の無い回は無視する', () => {
    const { termEnds: ends } = courseTermEndsWithOwners(
      [course({ courseName: 'A', courseCode: 'A1', sessions: sessions(['04/13', '07/20', null, null]) })],
      NOW,
    )
    expect(ends['A1']).toBe('2026-07-20')
  })

  it('日付のある回が1回以下なら鍵自体を作らない（データ不足で終了と誤判定しない＝fail-open）', () => {
    const { termEnds: ends } = courseTermEndsWithOwners(
      [
        course({ courseName: 'Empty', courseCode: 'E1', sessions: [] }),
        course({ courseName: 'One', courseCode: 'O1', sessions: sessions(['04/13']) }),
      ],
      NOW,
    )
    expect(ends['E1']).toBeUndefined()
    expect(ends['O1']).toBeUndefined()
  })
})

describe('isCourseActiveOn', () => {
  const termEnds = { '1234567': '2026-07-20', 情報リテラシー演習: '2026-07-20' }
  // 名前キーは同じ科目(1234567)が作ったもの＝その科目から引く分には従来どおり使える。
  const nameOwners = { 情報リテラシー演習: '1234567' }
  const base = {
    courseCode: '1234567', courseName: '情報リテラシー演習', termEnds, nameOwners, calendar: null, extraPlans: [] as never[],
  }

  it('最終回当日はまだ出す（境界は <= ）', () => {
    expect(isCourseActiveOn({ ...base, dateKey: '2026-07-20' })).toBe(true)
  })

  it('最終回より前は出す', () => {
    expect(isCourseActiveOn({ ...base, dateKey: '2026-05-11' })).toBe(true)
  })

  it('最終回の翌日は出さない', () => {
    expect(isCourseActiveOn({ ...base, dateKey: '2026-07-21' })).toBe(false)
  })

  it('出欠に載らない科目は常に出す（fail-open）', () => {
    expect(isCourseActiveOn({ ...base, courseCode: '9999999', courseName: '未収集科目', dateKey: '2026-12-01' })).toBe(true)
  })

  it('学期終了後でも同日に追加の予定があれば出す', () => {
    for (const t of ['final', 'midterm', 'quiz', 'other', 'roomChange', 'makeup'] as const) {
      const extraPlans = extraPlansFromEvents([ev({ type: t, date: '2026-08-05' })])
      expect(isCourseActiveOn({ ...base, dateKey: '2026-08-05', extraPlans })).toBe(true)
    }
  })

  it('その日が休講だけなら出さない（休講は「追加の予定」ではない）', () => {
    const extraPlans = extraPlansFromEvents([ev({ type: 'cancel', date: '2026-08-05', makeupStatus: 'undecided' })])
    expect(extraPlans).toEqual([])
    expect(isCourseActiveOn({ ...base, dateKey: '2026-08-05', extraPlans })).toBe(false)
  })

  it('別の科目の予定では復活しない', () => {
    const extraPlans = extraPlansFromEvents([ev({ type: 'final', date: '2026-08-05', courseCode: '7654321', courseName: '別科目' })])
    expect(isCourseActiveOn({ ...base, dateKey: '2026-08-05', extraPlans })).toBe(false)
  })

  it('別の日の予定では復活しない', () => {
    const extraPlans = extraPlansFromEvents([ev({ type: 'final', date: '2026-08-06' })])
    expect(isCourseActiveOn({ ...base, dateKey: '2026-08-05', extraPlans })).toBe(false)
  })

  it('courseCode を持たない予定は科目名で照合する', () => {
    const extraPlans = [{ courseCode: null, courseName: '情報リテラシー演習', date: '2026-08-05' }]
    expect(isCourseActiveOn({ ...base, dateKey: '2026-08-05', extraPlans })).toBe(true)
    expect(isCourseActiveOn({ ...base, courseName: '別科目', dateKey: '2026-08-05', extraPlans })).toBe(false)
  })
})

describe('extraPlansFromEvents', () => {
  it('休講内包の補講は補講日側の予定になる（科目コードは元イベントから引き継ぐ）', () => {
    const plans = extraPlansFromEvents([
      ev({
        type: 'cancel',
        date: '2026-07-13',
        makeupStatus: 'has',
        makeup: { date: '2026-08-03', periods: [3], room: 'K404' },
      }),
    ])
    expect(plans).toEqual([{ courseCode: '1234567', courseName: '情報リテラシー演習', date: '2026-08-03' }])
  })

  it('単独の補講は自身の日付が予定になる', () => {
    expect(extraPlansFromEvents([ev({ type: 'makeup', date: '2026-08-03' })])).toEqual([
      { courseCode: '1234567', courseName: '情報リテラシー演習', date: '2026-08-03' },
    ])
  })
})

describe('extraPlansFromCandidates', () => {
  function cand(o: Partial<BulletinEventCandidate> & { type: BulletinEventCandidate['type']; date: string }): BulletinEventCandidate {
    return {
      courseCode: null,
      courseName: '情報リテラシー演習',
      periods: [1],
      room: null,
      makeup: null,
      sourceBulletinId: 'b1',
      ...o,
    }
  }

  it('補講候補と休講内包補講だけを拾う', () => {
    const plans = extraPlansFromCandidates([
      cand({ type: 'makeup', date: '2026-08-03' }),
      cand({ type: 'cancel', date: '2026-07-13', makeup: { date: '2026-08-10', periods: [1], room: null } }),
      cand({ type: 'cancel', date: '2026-08-20' }),
      cand({ type: 'roomChange', date: '2026-08-21' }),
    ])
    expect(plans.map((p) => p.date)).toEqual(['2026-08-03', '2026-08-10'])
  })
})

describe('buildCourseTermInfo', () => {
  // 述語の入力を組む唯一の場所。画面(useCourseActive)と予約通知(notificationRefresh)が
  // 別々に組むと、片方だけ入力源が増えて静かにズレる（今回の不具合と同じ形）。
  const bulletin: BulletinItem = {
    id: 'b-makeup',
    category: '補講',
    title: '【補講】…図学・製図',
    date: '2026/06/24',
    meta: '',
    unread: false,
    flagged: false,
    important: false,
    body: parseBulletinDetail(DETAIL_MAKEUP),
  }

  it('出欠から最終授業日、登録イベントと掲示から追加の予定を束ねる', () => {
    const info = buildCourseTermInfo({
      courses: [course({ courseName: '情報リテラシー演習' })],
      events: [ev({ type: 'final', date: '2026-08-05' })],
      bulletins: [bulletin],
      now: NOW,
      calendar: null,
    })
    expect(info.termEnds['1234567']).toBe('2026-07-20')
    expect(info.extraPlans).toContainEqual({ courseCode: '1234567', courseName: '情報リテラシー演習', date: '2026-08-05' })
    // 掲示由来の補講（2026-09-23・図学・製図）も同じ配列に入る
    expect(info.extraPlans.map((p) => p.date)).toContain('2026-09-23')
  })

  it('入力が空なら空を返す（学期終了が不明＝全科目 fail-open）', () => {
    const info = buildCourseTermInfo({ courses: [], events: [], bulletins: [], now: NOW, calendar: null })
    expect(info).toEqual({ termEnds: {}, nameOwners: {}, calendar: null, extraPlans: [] })
    expect(isCourseActiveOn({ courseCode: 'X', courseName: 'X', dateKey: '2026-12-01', ...info })).toBe(true)
  })

  it('本文未取得の掲示は追加の予定を生まない（落ちない）', () => {
    const info = buildCourseTermInfo({
      courses: [],
      events: [],
      bulletins: [{ ...bulletin, body: null }],
      now: NOW,
      calendar: null,
    })
    expect(info.extraPlans).toEqual([])
  })
})

describe('🔴 同名科目の衝突（2026-08-28 監査）', () => {
  const base = { dateKey: '2026-10-09', extraPlans: [] }
  // 前期「英語３」(1111111・最終回 2026-07-17) の記録だけが端末にある状態。
  // 名前キーは**その前期科目が作った**＝後期の別コード科目が流用してはいけない。
  const termEnds = { '1111111': '2026-07-17', '英語３': '2026-07-17' }
  const nameOwners = { '英語３': '1111111' }

  it('後期の同名別コード科目を、前期の終了日で黙らせない', () => {
    expect(isCourseActiveOn({ ...base, courseCode: '2222222', courseName: '英語３', termEnds, nameOwners, calendar: null })).toBe(true)
  })

  it('前期のその科目自体は、終了日を過ぎたら黙る（従来どおり）', () => {
    expect(isCourseActiveOn({ ...base, courseCode: '1111111', courseName: '英語３', termEnds, nameOwners, calendar: null })).toBe(false)
  })

  it('コードが無い科目は従来どおり名前で引く（出欠側でコードが取れない場合の保険）', () => {
    expect(isCourseActiveOn({ ...base, courseCode: '', courseName: '英語３', termEnds, nameOwners, calendar: null })).toBe(false)
  })
})

describe('🔴 学年暦のゲート（2026-08-28 ユーザー要望「学期間は一切鳴らない」）', () => {
  const cal = parseAcademicCalendar({
    terms: [
      { id: 'spring', start: '2026-04-09', end: '2026-08-07' },
      { id: 'fall', start: '2026-09-11', end: '2027-01-26' },
    ],
  })
  // 後期の科目＝出欠がまだ無い＝従来は fail-open で鳴っていた状態を再現する。
  const base = {
    courseCode: 'C-FALL', courseName: '電気回路A', termEnds: {}, nameOwners: {}, extraPlans: [],
  }

  it('学期間は黙る（後期の出欠が無くても鳴らない＝要望の本体）', () => {
    expect(isCourseActiveOn({ ...base, dateKey: '2026-08-31', calendar: cal })).toBe(false)
    expect(isCourseActiveOn({ ...base, dateKey: '2026-09-10', calendar: cal })).toBe(false)
  })

  it('🔴 学期間でも、その日に補講・期末があれば鳴る（実在する授業まで消さない）', () => {
    const extraPlans = [{ courseCode: 'C-FALL', courseName: '電気回路A', date: '2026-08-31' }]
    expect(isCourseActiveOn({ ...base, extraPlans, dateKey: '2026-08-31', calendar: cal })).toBe(true)
    // 別の日は黙ったまま
    expect(isCourseActiveOn({ ...base, extraPlans, dateKey: '2026-09-01', calendar: cal })).toBe(false)
  })

  it('授業実施期間の中は従来どおり（境界の初日・最終日を含む）', () => {
    expect(isCourseActiveOn({ ...base, dateKey: '2026-09-11', calendar: cal })).toBe(true)
    expect(isCourseActiveOn({ ...base, dateKey: '2026-08-07', calendar: cal })).toBe(true)
  })

  it('🔴 暦が無ければ従来どおり鳴る（オフライン・未配信・更新直後の fail-open）', () => {
    expect(isCourseActiveOn({ ...base, dateKey: '2026-08-31', calendar: null })).toBe(true)
  })

  it('🔴 未来の期間が無い古い暦は効かせない（更新忘れで永久に黙らせない）', () => {
    expect(isCourseActiveOn({ ...base, dateKey: '2027-03-01', calendar: cal })).toBe(true)
  })
})
