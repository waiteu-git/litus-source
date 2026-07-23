import { describe, it, expect } from 'vitest'
import {
  diagnoseDashboard,
  diagnoseCoursePage,
  diagnoseActivityPage,
  diagnoseCourseLossAggregate,
  diagnoseAuthProbe,
  DIAGNOSTIC_CODES,
  type PageAuthState,
} from './diagnose'

const NON_LOGGED_IN: PageAuthState[] = ['logged_out', 'unknown']

describe('diagnoseDashboard', () => {
  it('ログイン済み・0コース・既知コース有り → DASHBOARD_UNREADABLE', () => {
    expect(
      diagnoseDashboard({ pageAuthState: 'logged_in', courseAnchorCount: 0, knownCourseCount: 5 }),
    ).toEqual(['DASHBOARD_UNREADABLE'])
  })

  it('既知コース0（初回/未登録）は正当な空 → 発火しない', () => {
    expect(
      diagnoseDashboard({ pageAuthState: 'logged_in', courseAnchorCount: 0, knownCourseCount: 0 }),
    ).toEqual([])
  })

  it('コースが読めていれば発火しない', () => {
    expect(
      diagnoseDashboard({ pageAuthState: 'logged_in', courseAnchorCount: 3, knownCourseCount: 5 }),
    ).toEqual([])
  })

  it('logged_out は LOGGED_OUT のみ（他コードと共発火しない）', () => {
    expect(
      diagnoseDashboard({ pageAuthState: 'logged_out', courseAnchorCount: 0, knownCourseCount: 5 }),
    ).toEqual(['LOGGED_OUT'])
  })

  it('unknown は迷ったら鳴らさない', () => {
    expect(
      diagnoseDashboard({ pageAuthState: 'unknown', courseAnchorCount: 0, knownCourseCount: 5 }),
    ).toEqual([])
  })
})

describe('diagnoseCoursePage', () => {
  it('既知コース(prev>0)がマーカー有りで0件化 → COURSE_LOST_ALL_ASSIGNMENTS', () => {
    expect(
      diagnoseCoursePage({
        pageAuthState: 'logged_in',
        modAnchorCount: 0,
        prevSignatureLen: 4,
        hasCourseMarker: true,
      }),
    ).toEqual(['COURSE_LOST_ALL_ASSIGNMENTS'])
  })

  it('既知コースがマーカーごと消えて0件化 → COURSE_PAGE_NO_ACTIVITIES', () => {
    expect(
      diagnoseCoursePage({
        pageAuthState: 'logged_in',
        modAnchorCount: 0,
        prevSignatureLen: 4,
        hasCourseMarker: false,
      }),
    ).toEqual(['COURSE_PAGE_NO_ACTIVITIES'])
  })

  it('初回スキャン（prev=null）は発火しない', () => {
    expect(
      diagnoseCoursePage({
        pageAuthState: 'logged_in',
        modAnchorCount: 0,
        prevSignatureLen: null,
        hasCourseMarker: true,
      }),
    ).toEqual([])
  })

  it('既知の空コース（prev=0）は正当な空 → 発火しない', () => {
    expect(
      diagnoseCoursePage({
        pageAuthState: 'logged_in',
        modAnchorCount: 0,
        prevSignatureLen: 0,
        hasCourseMarker: true,
      }),
    ).toEqual([])
  })

  it('活動が読めていれば（部分減少含む）発火しない', () => {
    expect(
      diagnoseCoursePage({
        pageAuthState: 'logged_in',
        modAnchorCount: 2,
        prevSignatureLen: 5,
        hasCourseMarker: true,
      }),
    ).toEqual([])
  })

  it('logged_out は LOGGED_OUT のみ', () => {
    expect(
      diagnoseCoursePage({
        pageAuthState: 'logged_out',
        modAnchorCount: 0,
        prevSignatureLen: 4,
        hasCourseMarker: false,
      }),
    ).toEqual(['LOGGED_OUT'])
  })

  it('unknown は発火しない', () => {
    expect(
      diagnoseCoursePage({
        pageAuthState: 'unknown',
        modAnchorCount: 0,
        prevSignatureLen: 4,
        hasCourseMarker: false,
      }),
    ).toEqual([])
  })
})

describe('diagnoseActivityPage', () => {
  it('キーワード有り・日付パース失敗 → DEADLINE_KEYWORD_NO_DATE', () => {
    expect(
      diagnoseActivityPage({
        pageAuthState: 'logged_in',
        keywordFound: true,
        dateParsed: false,
        statusResolved: true,
        moduleType: 'assign',
        moduleSupported: true,
      }),
    ).toEqual(['DEADLINE_KEYWORD_NO_DATE'])
  })

  it('未対応型・状態未解決・締切証拠有り → UNSUPPORTED_MODULE', () => {
    expect(
      diagnoseActivityPage({
        pageAuthState: 'logged_in',
        keywordFound: false,
        dateParsed: true,
        statusResolved: false,
        moduleType: 'workshop',
        moduleSupported: false,
      }),
    ).toEqual(['UNSUPPORTED_MODULE'])
  })

  it('2チェックは独立・共発火する', () => {
    expect(
      diagnoseActivityPage({
        pageAuthState: 'logged_in',
        keywordFound: true,
        dateParsed: false,
        statusResolved: false,
        moduleType: 'workshop',
        moduleSupported: false,
      }),
    ).toEqual(['DEADLINE_KEYWORD_NO_DATE', 'UNSUPPORTED_MODULE'])
  })

  it('未対応型でも締切証拠が無ければ UNSUPPORTED_MODULE を鳴らさない（ノイズ抑制）', () => {
    expect(
      diagnoseActivityPage({
        pageAuthState: 'logged_in',
        keywordFound: false,
        dateParsed: false,
        statusResolved: false,
        moduleType: 'forum',
        moduleSupported: false,
      }),
    ).toEqual([])
  })

  it('未対応型でも状態が解決できていれば鳴らさない', () => {
    expect(
      diagnoseActivityPage({
        pageAuthState: 'logged_in',
        keywordFound: true,
        dateParsed: true,
        statusResolved: true,
        moduleType: 'workshop',
        moduleSupported: false,
      }),
    ).toEqual([])
  })

  it('対応型の状態unknownは正当variant → 発火しない', () => {
    expect(
      diagnoseActivityPage({
        pageAuthState: 'logged_in',
        keywordFound: true,
        dateParsed: true,
        statusResolved: false,
        moduleType: 'assign',
        moduleSupported: true,
      }),
    ).toEqual([])
  })

  it('全て正常 → 発火しない', () => {
    expect(
      diagnoseActivityPage({
        pageAuthState: 'logged_in',
        keywordFound: true,
        dateParsed: true,
        statusResolved: true,
        moduleType: 'assign',
        moduleSupported: true,
      }),
    ).toEqual([])
  })

  it('logged_out は LOGGED_OUT のみ（DEADLINE系と共発火しない）', () => {
    expect(
      diagnoseActivityPage({
        pageAuthState: 'logged_out',
        keywordFound: true,
        dateParsed: false,
        statusResolved: false,
        moduleType: 'workshop',
        moduleSupported: false,
      }),
    ).toEqual(['LOGGED_OUT'])
  })

  it('unknown は発火しない', () => {
    expect(
      diagnoseActivityPage({
        pageAuthState: 'unknown',
        keywordFound: true,
        dateParsed: false,
        statusResolved: false,
        moduleType: 'workshop',
        moduleSupported: false,
      }),
    ).toEqual([])
  })
})

describe('diagnoseCourseLossAggregate', () => {
  it('2件喪失・過半（tracked=3）→ COURSES_MAJORITY_LOST', () => {
    expect(diagnoseCourseLossAggregate({ lostCourseCount: 2, trackedCourseCount: 3 })).toEqual([
      'COURSES_MAJORITY_LOST',
    ])
  })

  it('1件喪失は絶対に昇格しない（info階級の設計根拠）', () => {
    expect(diagnoseCourseLossAggregate({ lostCourseCount: 1, trackedCourseCount: 1 })).toEqual([])
    expect(diagnoseCourseLossAggregate({ lostCourseCount: 1, trackedCourseCount: 2 })).toEqual([])
  })

  it('ちょうど半数は不発（厳密過半のみ）', () => {
    expect(diagnoseCourseLossAggregate({ lostCourseCount: 2, trackedCourseCount: 4 })).toEqual([])
    expect(diagnoseCourseLossAggregate({ lostCourseCount: 3, trackedCourseCount: 6 })).toEqual([])
  })

  it('過半を超えれば昇格', () => {
    expect(diagnoseCourseLossAggregate({ lostCourseCount: 3, trackedCourseCount: 5 })).toEqual([
      'COURSES_MAJORITY_LOST',
    ])
    expect(diagnoseCourseLossAggregate({ lostCourseCount: 5, trackedCourseCount: 5 })).toEqual([
      'COURSES_MAJORITY_LOST',
    ])
  })
})

describe('diagnoseAuthProbe', () => {
  it('fetch失敗 → 診断しない（ネットワーク経路の責務）', () => {
    expect(diagnoseAuthProbe({ fetchOk: false, hasMcfg: false, hasLoginMarker: true })).toEqual([])
  })

  it('ログインマーカー有り → LOGGED_OUT（M.cfg無しより優先）', () => {
    expect(diagnoseAuthProbe({ fetchOk: true, hasMcfg: false, hasLoginMarker: true })).toEqual([
      'LOGGED_OUT',
    ])
  })

  it('M.cfg無し・ログインマーカー無し → NOT_A_MOODLE_PAGE', () => {
    expect(diagnoseAuthProbe({ fetchOk: true, hasMcfg: false, hasLoginMarker: false })).toEqual([
      'NOT_A_MOODLE_PAGE',
    ])
  })

  it('M.cfg有り → 発火しない', () => {
    expect(diagnoseAuthProbe({ fetchOk: true, hasMcfg: true, hasLoginMarker: false })).toEqual([])
  })
})

describe('認証状態ゲート（共通不変条件）', () => {
  it('全面: 非ログイン状態では実矛盾コードが漏れない', () => {
    for (const auth of NON_LOGGED_IN) {
      const expected = auth === 'logged_out' ? ['LOGGED_OUT'] : []
      expect(
        diagnoseDashboard({ pageAuthState: auth, courseAnchorCount: 0, knownCourseCount: 9 }),
      ).toEqual(expected)
      expect(
        diagnoseCoursePage({
          pageAuthState: auth,
          modAnchorCount: 0,
          prevSignatureLen: 9,
          hasCourseMarker: false,
        }),
      ).toEqual(expected)
      expect(
        diagnoseActivityPage({
          pageAuthState: auth,
          keywordFound: true,
          dateParsed: false,
          statusResolved: false,
          moduleType: 'workshop',
          moduleSupported: false,
        }),
      ).toEqual(expected)
    }
  })
})

describe('DIAGNOSTIC_CODES 台帳', () => {
  it('8種・重複なし', () => {
    expect(DIAGNOSTIC_CODES).toHaveLength(8)
    expect(new Set(DIAGNOSTIC_CODES).size).toBe(8)
  })
})
