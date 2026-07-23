import { describe, it, expect } from 'vitest'
import {
  applyScanOutcome,
  isInfoDiagnosticCode,
  INFO_DIAGNOSTIC_CODES,
  ESCALATION_THRESHOLD,
  type DiagnosticsState,
} from './diagnosticsState'
import { DIAGNOSTIC_CODES } from './diagnose'

const T0 = '2026-07-23T00:00:00.000Z'
const T1 = '2026-07-23T01:00:00.000Z'
const T2 = '2026-07-23T02:00:00.000Z'
const T3 = '2026-07-23T03:00:00.000Z'

describe('isInfoDiagnosticCode / 階級台帳', () => {
  it('info階級は3種', () => {
    expect([...INFO_DIAGNOSTIC_CODES].sort()).toEqual(
      ['COURSE_LOST_ALL_ASSIGNMENTS', 'DEADLINE_KEYWORD_NO_DATE', 'UNSUPPORTED_MODULE'].sort(),
    )
  })

  it('残り5種は hard', () => {
    const hard = DIAGNOSTIC_CODES.filter((c) => !isInfoDiagnosticCode(c))
    expect(hard.sort()).toEqual(
      [
        'DASHBOARD_UNREADABLE',
        'COURSE_PAGE_NO_ACTIVITIES',
        'COURSES_MAJORITY_LOST',
        'NOT_A_MOODLE_PAGE',
        'LOGGED_OUT',
      ].sort(),
    )
  })

  it('ESCALATION_THRESHOLD は 2', () => {
    expect(ESCALATION_THRESHOLD).toBe(2)
  })
})

describe('applyScanOutcome: 成功（hardゼロ）', () => {
  it('初回・空コード → lastGoodAt=at・failures=0・active空', () => {
    const s = applyScanOutcome(null, { codes: [], at: T0 })
    expect(s).toEqual({
      lastGoodAt: T0,
      consecutiveFailures: 0,
      activeCodes: [],
      infoCodes: [],
      lastCodes: [],
      updatedAt: T0,
    })
  })

  it('infoコードだけの観測も成功（infoは保持・失敗系は駆動しない）', () => {
    const s = applyScanOutcome(null, {
      codes: ['UNSUPPORTED_MODULE', 'DEADLINE_KEYWORD_NO_DATE'],
      at: T0,
    })
    expect(s.lastGoodAt).toBe(T0)
    expect(s.consecutiveFailures).toBe(0)
    expect(s.activeCodes).toEqual([])
    expect(s.infoCodes).toEqual(['UNSUPPORTED_MODULE', 'DEADLINE_KEYWORD_NO_DATE'])
    expect(s.lastCodes).toEqual(['UNSUPPORTED_MODULE', 'DEADLINE_KEYWORD_NO_DATE'])
  })

  it('失敗が続いた後の成功でカウンタ・activeをリセットしlastGoodを更新', () => {
    const failed: DiagnosticsState = {
      lastGoodAt: T0,
      consecutiveFailures: 3,
      activeCodes: ['DASHBOARD_UNREADABLE'],
      infoCodes: [],
      lastCodes: ['DASHBOARD_UNREADABLE'],
      updatedAt: T1,
    }
    const s = applyScanOutcome(failed, { codes: [], at: T2 })
    expect(s.lastGoodAt).toBe(T2)
    expect(s.consecutiveFailures).toBe(0)
    expect(s.activeCodes).toEqual([])
  })
})

describe('applyScanOutcome: 失敗（hard有り）とデバウンス', () => {
  it('1回目の失敗は昇格しない（active空・カウンタ1・lastGood据置）', () => {
    const s = applyScanOutcome(null, { codes: ['DASHBOARD_UNREADABLE'], at: T0 })
    expect(s.consecutiveFailures).toBe(1)
    expect(s.activeCodes).toEqual([])
    expect(s.lastGoodAt).toBe(null)
    expect(s.lastCodes).toEqual(['DASHBOARD_UNREADABLE'])
  })

  it('2回連続で初めて昇格（今回のhardコードで置換）', () => {
    const s1 = applyScanOutcome(null, { codes: ['DASHBOARD_UNREADABLE'], at: T0 })
    const s2 = applyScanOutcome(s1, { codes: ['DASHBOARD_UNREADABLE'], at: T1 })
    expect(s2.consecutiveFailures).toBe(2)
    expect(s2.activeCodes).toEqual(['DASHBOARD_UNREADABLE'])
  })

  it('lastGoodAt は失敗中ずっと据置', () => {
    const good = applyScanOutcome(null, { codes: [], at: T0 })
    const s1 = applyScanOutcome(good, { codes: ['COURSE_PAGE_NO_ACTIVITIES'], at: T1 })
    const s2 = applyScanOutcome(s1, { codes: ['COURSE_PAGE_NO_ACTIVITIES'], at: T2 })
    expect(s1.lastGoodAt).toBe(T0)
    expect(s2.lastGoodAt).toBe(T0)
  })

  it('昇格後も最新観測で置換し古い症状を引きずらない', () => {
    const s1 = applyScanOutcome(null, { codes: ['DASHBOARD_UNREADABLE'], at: T0 })
    const s2 = applyScanOutcome(s1, { codes: ['DASHBOARD_UNREADABLE'], at: T1 })
    const s3 = applyScanOutcome(s2, { codes: ['COURSE_PAGE_NO_ACTIVITIES'], at: T2 })
    expect(s3.consecutiveFailures).toBe(3)
    expect(s3.activeCodes).toEqual(['COURSE_PAGE_NO_ACTIVITIES'])
  })
})

describe('applyScanOutcome: LOGGED_OUT 即時昇格の例外', () => {
  it('初回観測でも即 active（2周期待たない）', () => {
    const s = applyScanOutcome(null, { codes: ['LOGGED_OUT'], at: T0 })
    expect(s.consecutiveFailures).toBe(1)
    expect(s.activeCodes).toEqual(['LOGGED_OUT'])
  })

  it('閾値未満では随伴hardコードは昇格させず LOGGED_OUT だけ示す', () => {
    const s = applyScanOutcome(null, {
      codes: ['LOGGED_OUT', 'DASHBOARD_UNREADABLE'],
      at: T0,
    })
    expect(s.activeCodes).toEqual(['LOGGED_OUT'])
    // 生観測は両方 lastCodes に残す
    expect(s.lastCodes).toEqual(['LOGGED_OUT', 'DASHBOARD_UNREADABLE'])
  })

  it('閾値到達時は今回hard全部で置換（LOGGED_OUT含む）', () => {
    const s1 = applyScanOutcome(null, { codes: ['LOGGED_OUT'], at: T0 })
    const s2 = applyScanOutcome(s1, {
      codes: ['LOGGED_OUT', 'DASHBOARD_UNREADABLE'],
      at: T1,
    })
    expect(s2.consecutiveFailures).toBe(2)
    expect(s2.activeCodes).toEqual(['LOGGED_OUT', 'DASHBOARD_UNREADABLE'])
  })

  it('carriedActive に既存 LOGGED_OUT があっても重複しない', () => {
    const s1 = applyScanOutcome(null, { codes: ['LOGGED_OUT'], at: T0 })
    // わざと閾値未満に留める新しい prev を作る（consecutiveFailures=0 相当）
    const primed: DiagnosticsState = { ...s1, consecutiveFailures: 0 }
    const s2 = applyScanOutcome(primed, { codes: ['LOGGED_OUT'], at: T1 })
    expect(s2.consecutiveFailures).toBe(1)
    expect(s2.activeCodes).toEqual(['LOGGED_OUT'])
  })
})

describe('applyScanOutcome: hard/info分離', () => {
  it('hard+info混在の失敗: activeはhardのみ・infoCodesは今回infoで置換', () => {
    const s1 = applyScanOutcome(null, {
      codes: ['DASHBOARD_UNREADABLE', 'UNSUPPORTED_MODULE'],
      at: T0,
    })
    const s2 = applyScanOutcome(s1, {
      codes: ['DASHBOARD_UNREADABLE', 'UNSUPPORTED_MODULE'],
      at: T1,
    })
    expect(s2.activeCodes).toEqual(['DASHBOARD_UNREADABLE'])
    expect(s2.infoCodes).toEqual(['UNSUPPORTED_MODULE'])
    expect(s2.consecutiveFailures).toBe(2)
  })

  it('infoは失敗カウンタを駆動しない（infoだけならlastGood更新・カウンタ0）', () => {
    const s1 = applyScanOutcome(null, { codes: ['DASHBOARD_UNREADABLE'], at: T0 })
    const s2 = applyScanOutcome(s1, { codes: ['UNSUPPORTED_MODULE'], at: T1 })
    expect(s2.consecutiveFailures).toBe(0)
    expect(s2.lastGoodAt).toBe(T1)
    expect(s2.activeCodes).toEqual([])
    expect(s2.infoCodes).toEqual(['UNSUPPORTED_MODULE'])
  })

  it('閾値未満の失敗中、prev.activeCodes に紛れた info は自己修復で除去', () => {
    const dirty: DiagnosticsState = {
      lastGoodAt: T0,
      consecutiveFailures: 0,
      activeCodes: ['DASHBOARD_UNREADABLE', 'UNSUPPORTED_MODULE'], // 旧データの汚染
      infoCodes: [],
      lastCodes: [],
      updatedAt: T0,
    }
    const s = applyScanOutcome(dirty, { codes: ['COURSE_PAGE_NO_ACTIVITIES'], at: T1 })
    // 閾値未満なので carriedActive を持ち越すが info は除去される
    expect(s.consecutiveFailures).toBe(1)
    expect(s.activeCodes).toEqual(['DASHBOARD_UNREADABLE'])
  })
})

describe('applyScanOutcome: 正規化と非破壊', () => {
  it('重複コードは排除する', () => {
    const s = applyScanOutcome(null, {
      codes: ['DASHBOARD_UNREADABLE', 'DASHBOARD_UNREADABLE', 'UNSUPPORTED_MODULE', 'UNSUPPORTED_MODULE'],
      at: T0,
    })
    expect(s.lastCodes).toEqual(['DASHBOARD_UNREADABLE', 'UNSUPPORTED_MODULE'])
  })

  it('prev / outcome を変異させない（structuredClone照合）', () => {
    const prev = applyScanOutcome(null, { codes: ['DASHBOARD_UNREADABLE'], at: T0 })
    const prevClone = structuredClone(prev)
    const outcome = { codes: ['COURSE_PAGE_NO_ACTIVITIES'] as const, at: T1 }
    const outcomeClone = structuredClone(outcome)
    applyScanOutcome(prev, { codes: [...outcome.codes], at: outcome.at })
    expect(prev).toEqual(prevClone)
    expect(outcome).toEqual(outcomeClone)
  })

  it('3連続失敗→成功→再失敗の一巡（回復と再検知）', () => {
    let s = applyScanOutcome(null, { codes: ['NOT_A_MOODLE_PAGE'], at: T0 })
    s = applyScanOutcome(s, { codes: ['NOT_A_MOODLE_PAGE'], at: T1 })
    expect(s.activeCodes).toEqual(['NOT_A_MOODLE_PAGE'])
    s = applyScanOutcome(s, { codes: [], at: T2 })
    expect(s.activeCodes).toEqual([])
    expect(s.lastGoodAt).toBe(T2)
    s = applyScanOutcome(s, { codes: ['NOT_A_MOODLE_PAGE'], at: T3 })
    // 成功でカウンタが0に戻っているので再び1からデバウンス
    expect(s.consecutiveFailures).toBe(1)
    expect(s.activeCodes).toEqual([])
  })
})
