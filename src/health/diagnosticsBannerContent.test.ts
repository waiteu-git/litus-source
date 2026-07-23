import { describe, it, expect } from 'vitest'
import {
  buildBannerContent,
  buildInfoNotes,
  formatLastGoodAt,
  type BannerContent,
} from './diagnosticsBannerContent'
import type { DiagnosticsState } from './diagnosticsState'
import type { DiagnosticCode } from './diagnose'

const T_GOOD = '2026-07-23T10:00:00'
const T_NOW = '2026-07-23T12:00:00'

/** activeCodes / infoCodes を差し替えた DiagnosticsState を作るヘルパ */
function stateWith(
  activeCodes: DiagnosticCode[],
  overrides: Partial<DiagnosticsState> = {},
): DiagnosticsState {
  return {
    lastGoodAt: T_GOOD,
    consecutiveFailures: activeCodes.length > 0 ? 2 : 0,
    activeCodes,
    infoCodes: [],
    lastCodes: activeCodes,
    updatedAt: T_NOW,
    ...overrides,
  }
}

describe('buildBannerContent: 非表示（kind: none）', () => {
  it('state=null（未スキャン・保存無し）では表示しない', () => {
    expect(buildBannerContent(null)).toEqual({
      kind: 'none',
      title: '',
      body: '',
      lastGoodAt: null,
    } satisfies BannerContent)
  })

  it('activeCodes が空なら表示しない（デバウンス未達＝バナー化しない）', () => {
    // lastCodes / infoCodes に何が残っていても activeCodes が空なら none。
    const s = stateWith([], { infoCodes: ['UNSUPPORTED_MODULE'], lastCodes: ['DASHBOARD_UNREADABLE'] })
    expect(buildBannerContent(s).kind).toBe('none')
  })
})

describe('buildBannerContent: 種別解決', () => {
  it('LOGGED_OUT → logged_out', () => {
    const c = buildBannerContent(stateWith(['LOGGED_OUT']))
    expect(c.kind).toBe('logged_out')
    expect(c.title).toContain('ログアウト')
    expect(c.lastGoodAt).toBe(T_GOOD)
  })

  it('DASHBOARD_UNREADABLE → unreadable', () => {
    expect(buildBannerContent(stateWith(['DASHBOARD_UNREADABLE'])).kind).toBe('unreadable')
  })

  it('COURSE_PAGE_NO_ACTIVITIES / COURSES_MAJORITY_LOST → unreadable', () => {
    expect(buildBannerContent(stateWith(['COURSE_PAGE_NO_ACTIVITIES'])).kind).toBe('unreadable')
    expect(buildBannerContent(stateWith(['COURSES_MAJORITY_LOST'])).kind).toBe('unreadable')
  })

  it('UNSUPPORTED_MODULE のみ → unsupported', () => {
    expect(buildBannerContent(stateWith(['UNSUPPORTED_MODULE'])).kind).toBe('unsupported')
  })

  it('複数 active は原因を1つに絞る（logged_out > unreadable > unsupported）', () => {
    expect(
      buildBannerContent(stateWith(['UNSUPPORTED_MODULE', 'DASHBOARD_UNREADABLE', 'LOGGED_OUT'])).kind,
    ).toBe('logged_out')
    expect(buildBannerContent(stateWith(['UNSUPPORTED_MODULE', 'DASHBOARD_UNREADABLE'])).kind).toBe(
      'unreadable',
    )
  })

  it('未知の将来 hard コードは none でなく unreadable へ倒す（fail loud）', () => {
    const c = buildBannerContent(stateWith(['SOME_FUTURE_CODE' as DiagnosticCode]))
    expect(c.kind).toBe('unreadable')
  })

  it('ユーザーに診断コード名や技術用語を出さない', () => {
    for (const codes of [['LOGGED_OUT'], ['DASHBOARD_UNREADABLE'], ['UNSUPPORTED_MODULE']] as DiagnosticCode[][]) {
      const c = buildBannerContent(stateWith(codes))
      const joined = `${c.title}${c.body}`
      for (const code of DIAGNOSTIC_CODE_NAMES) {
        expect(joined).not.toContain(code)
      }
      expect(joined).not.toMatch(/M\.cfg|sesskey|DOM|Moodle|BS5/)
    }
  })
})

// diagnose のコード名がユーザー向け文言へ漏れていないことを機械的に確認する材料
const DIAGNOSTIC_CODE_NAMES: DiagnosticCode[] = [
  'DASHBOARD_UNREADABLE',
  'COURSE_PAGE_NO_ACTIVITIES',
  'DEADLINE_KEYWORD_NO_DATE',
  'COURSE_LOST_ALL_ASSIGNMENTS',
  'COURSES_MAJORITY_LOST',
  'NOT_A_MOODLE_PAGE',
  'UNSUPPORTED_MODULE',
  'LOGGED_OUT',
]

describe('buildInfoNotes', () => {
  it('state=null / activeCodes 非空では出さない（警告バナーと排他）', () => {
    expect(buildInfoNotes(null)).toEqual([])
    expect(buildInfoNotes(stateWith(['DASHBOARD_UNREADABLE'], { infoCodes: ['UNSUPPORTED_MODULE'] }))).toEqual([])
  })

  it('infoCodes を固定順（unsupported 先頭）で1コード1ノートにする', () => {
    const s = stateWith([], {
      infoCodes: ['DEADLINE_KEYWORD_NO_DATE', 'UNSUPPORTED_MODULE'],
    })
    const notes = buildInfoNotes(s)
    expect(notes.map((n) => n.code)).toEqual(['UNSUPPORTED_MODULE', 'DEADLINE_KEYWORD_NO_DATE'])
    expect(notes[0].text).toContain('対応していません')
  })

  it('未知の info コードは汎用文へ倒し、同文は1つに束ねる', () => {
    const s = stateWith([], {
      infoCodes: ['FUTURE_A' as DiagnosticCode, 'FUTURE_B' as DiagnosticCode],
    })
    const notes = buildInfoNotes(s)
    expect(notes).toHaveLength(1)
    expect(notes[0].text).toContain('自動取得できていない')
  })

  it('infoCodes が空なら空配列', () => {
    expect(buildInfoNotes(stateWith([]))).toEqual([])
  })
})

describe('formatLastGoodAt', () => {
  const now = new Date('2026-07-23T12:00:00')

  it('null / 不正 ISO は null（行を出さない）', () => {
    expect(formatLastGoodAt(null, now)).toBeNull()
    expect(formatLastGoodAt('not-a-date', now)).toBeNull()
  })

  it('当日は時分のみ', () => {
    expect(formatLastGoodAt('2026-07-23T09:05:00', now)).toBe('最終取得: 09:05')
  })

  it('別日は月日も付す', () => {
    expect(formatLastGoodAt('2026-07-21T23:40:00', now)).toBe('最終取得: 7/21 23:40')
  })
})

describe('buildBannerContent / buildInfoNotes: 非破壊（入力を変異させない）', () => {
  it('入力 state を変異させない', () => {
    const s = stateWith(['DASHBOARD_UNREADABLE'], { infoCodes: ['UNSUPPORTED_MODULE'] })
    const snapshot = structuredClone(s)
    buildBannerContent(s)
    buildInfoNotes(s)
    expect(s).toEqual(snapshot)
  })
})
