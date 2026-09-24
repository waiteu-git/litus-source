import { describe, it, expect } from 'vitest'
import {
  MAX_REQUESTS_PER_YEAR,
  MIN_DAYS_BETWEEN_REQUESTS,
  MIN_DAYS_SINCE_FAILURE,
  MIN_DAYS_SINCE_FIRST_SEEN,
  MIN_VALUE_DAYS,
  SETTLE_MS,
  YEAR_DAYS,
  decideReview,
  type ReviewGateInput,
  type ReviewVeto,
} from './reviewGate'
import { DAY_MS, EMPTY_REVIEW_STATE } from './reviewState'

const NOW = new Date(2026, 9, 20, 12, 0, 0).getTime()
const BUILD = 221

/** すべての否決に当たらず、適格で、上限にも当たらない入力。これが ok:true を返すことが全テストの陽性対照。 */
const ELIGIBLE: ReviewGateInput = {
  now: NOW,
  stage: 'production',
  force: false,
  demo: false,
  killStatus: 'clear',
  diagnosticsBanner: false,
  maintenance: false,
  offline: false,
  attendanceRunning: false,
  nearClass: false,
  syncBusy: false,
  homeFocused: true,
  appActive: true,
  settledMs: SETTLE_MS,
  sessionRequested: false,
  buildNumber: BUILD,
  stateHealth: 'ok',
  state: {
    ...EMPTY_REVIEW_STATE,
    firstSeenAt: NOW - 30 * DAY_MS,
    valueDays: ['20260915', '20260916', '20260917', '20260918', '20260919'],
  },
}

const with_ = (over: Partial<ReviewGateInput>): ReviewGateInput => ({ ...ELIGIBLE, ...over })
const withState = (over: Partial<ReviewGateInput['state']>): ReviewGateInput => ({
  ...ELIGIBLE,
  state: { ...ELIGIBLE.state, ...over },
})

/** 否決の評価順（設計 §4.1）。各行は「その否決だけを起こす入力」。 */
const VETOES: Array<[ReviewVeto, (i: ReviewGateInput) => ReviewGateInput]> = [
  ['not_production', (i) => ({ ...i, stage: 'beta' })],
  ['demo', (i) => ({ ...i, demo: true })],
  ['status_unknown', (i) => ({ ...i, killStatus: 'unknown' })],
  ['stopped', (i) => ({ ...i, killStatus: 'stopped' })],
  ['notice', (i) => ({ ...i, killStatus: 'notice' })],
  ['diagnostics', (i) => ({ ...i, diagnosticsBanner: true })],
  ['maintenance', (i) => ({ ...i, maintenance: true })],
  ['offline', (i) => ({ ...i, offline: true })],
  ['attendance', (i) => ({ ...i, attendanceRunning: true })],
  ['near_class', (i) => ({ ...i, nearClass: true })],
  ['sync_busy', (i) => ({ ...i, syncBusy: true })],
  ['not_home', (i) => ({ ...i, homeFocused: false })],
  ['app_inactive', (i) => ({ ...i, appActive: false })],
  ['not_settled', (i) => ({ ...i, settledMs: SETTLE_MS - 1 })],
  ['session_requested', (i) => ({ ...i, sessionRequested: true })],
  ['state_unreadable', (i) => ({ ...i, stateHealth: 'corrupt' })],
  ['build_unknown', (i) => ({ ...i, buildNumber: null })],
  ['too_new', (i) => ({ ...i, state: { ...i.state, firstSeenAt: NOW - MIN_DAYS_SINCE_FIRST_SEEN * DAY_MS + 1 } })],
  ['recent_failure', (i) => ({ ...i, state: { ...i.state, lastFailureAt: NOW - MIN_DAYS_SINCE_FAILURE * DAY_MS + 1 } })],
  ['few_value_days', (i) => ({ ...i, state: { ...i.state, valueDays: i.state.valueDays.slice(0, MIN_VALUE_DAYS - 1) } })],
  ['same_build', (i) => ({ ...i, state: { ...i.state, lastBuild: BUILD } })],
  ['recent_request', (i) => ({ ...i, state: { ...i.state, requests: [NOW - MIN_DAYS_BETWEEN_REQUESTS * DAY_MS + 1] } })],
  [
    'yearly_limit',
    (i) => ({
      ...i,
      state: { ...i.state, requests: [NOW - 300 * DAY_MS, NOW - (MIN_DAYS_BETWEEN_REQUESTS + 10) * DAY_MS] },
    }),
  ],
]

describe('decideReview — 陽性対照と否決', () => {
  it('陽性対照: すべての条件を満たす入力は ok:true', () => {
    expect(decideReview(ELIGIBLE)).toEqual({ ok: true })
  })

  it.each(VETOES)('%s: その条件だけで否決され、理由が返る', (reason, make) => {
    expect(decideReview(make(ELIGIBLE))).toEqual({ ok: false, reason })
  })

  it('否決の評価順: 2つの否決が重なったら、表で先に書いた方の理由が返る（全組み合わせ）', () => {
    // 同じ入力項目を書き換える組（killStatus の3値・requests の2種）は同時に成り立たないので飛ばす。
    // 前者の優先順は reviewKillStatus 側（reviewSignals.test.ts）、後者は下の専用テストが持つ。
    const field = (reason: ReviewVeto): string =>
      reason === 'status_unknown' || reason === 'stopped' || reason === 'notice'
        ? 'killStatus'
        : reason === 'recent_request' || reason === 'yearly_limit'
          ? 'requests'
          : reason
    for (let a = 0; a < VETOES.length; a++) {
      for (let b = a + 1; b < VETOES.length; b++) {
        if (field(VETOES[a][0]) === field(VETOES[b][0])) continue
        const input = VETOES[b][1](VETOES[a][1](ELIGIBLE))
        expect(decideReview(input), `${VETOES[a][0]} × ${VETOES[b][0]}`).toEqual({ ok: false, reason: VETOES[a][0] })
      }
    }
  })

  it('直近120日以内の依頼があり、かつ365日で2回に達している時は recent_request が先', () => {
    expect(
      decideReview(withState({ requests: [NOW - 300 * DAY_MS, NOW - 100 * DAY_MS], lastBuild: BUILD - 1 })),
    ).toEqual({ ok: false, reason: 'recent_request' })
  })
})

describe('decideReview — 静止（settledMs）の境界', () => {
  it('SETTLE_MS 未満は not_settled、ちょうどなら通る', () => {
    expect(decideReview(with_({ settledMs: SETTLE_MS - 1 }))).toEqual({ ok: false, reason: 'not_settled' })
    expect(decideReview(with_({ settledMs: SETTLE_MS }))).toEqual({ ok: true })
  })
})

describe('decideReview — 適格の境界', () => {
  it('更新後の初回記録から14日: ちょうどで通り、1ms 足りないと too_new', () => {
    expect(decideReview(withState({ firstSeenAt: NOW - 14 * DAY_MS }))).toEqual({ ok: true })
    expect(decideReview(withState({ firstSeenAt: NOW - 14 * DAY_MS + 1 }))).toEqual({ ok: false, reason: 'too_new' })
  })

  it('初回記録がまだ無い（null）・未来の時刻は too_new', () => {
    expect(decideReview(withState({ firstSeenAt: null }))).toEqual({ ok: false, reason: 'too_new' })
    expect(decideReview(withState({ firstSeenAt: NOW + DAY_MS }))).toEqual({ ok: false, reason: 'too_new' })
  })

  it('最後の失敗から7日: ちょうどで通り、1ms 足りないと recent_failure。失敗が無い（null）なら通る', () => {
    expect(decideReview(withState({ lastFailureAt: NOW - 7 * DAY_MS }))).toEqual({ ok: true })
    expect(decideReview(withState({ lastFailureAt: NOW - 7 * DAY_MS + 1 }))).toEqual({ ok: false, reason: 'recent_failure' })
    expect(decideReview(withState({ lastFailureAt: null }))).toEqual({ ok: true })
  })

  it('未来の失敗時刻（時計のずれ）は recent_failure＝待つ側に倒す', () => {
    expect(decideReview(withState({ lastFailureAt: NOW + DAY_MS }))).toEqual({ ok: false, reason: 'recent_failure' })
  })

  it('価値のあった日が5日: ちょうどで通り、4日だと few_value_days', () => {
    expect(decideReview(withState({ valueDays: ['20260915', '20260916', '20260917', '20260918', '20260919'] }))).toEqual({ ok: true })
    expect(decideReview(withState({ valueDays: ['20260915', '20260916', '20260917', '20260918'] }))).toEqual({
      ok: false,
      reason: 'few_value_days',
    })
  })
})

describe('decideReview — 上限の境界', () => {
  it('同じビルドでは出さない。別のビルド番号・未記録（null）なら通る', () => {
    expect(decideReview(withState({ lastBuild: BUILD }))).toEqual({ ok: false, reason: 'same_build' })
    expect(decideReview(withState({ lastBuild: BUILD - 1 }))).toEqual({ ok: true })
    expect(decideReview(withState({ lastBuild: null }))).toEqual({ ok: true })
  })

  it('前回の依頼から120日: ちょうどで通り、1ms 足りないと recent_request', () => {
    expect(decideReview(withState({ requests: [NOW - 120 * DAY_MS], lastBuild: BUILD - 1 }))).toEqual({ ok: true })
    expect(decideReview(withState({ requests: [NOW - 120 * DAY_MS + 1], lastBuild: BUILD - 1 }))).toEqual({
      ok: false,
      reason: 'recent_request',
    })
  })

  it('365日で2回まで: 直近365日に2回あると yearly_limit', () => {
    expect(MAX_REQUESTS_PER_YEAR).toBe(2)
    expect(
      decideReview(withState({ requests: [NOW - 300 * DAY_MS, NOW - 130 * DAY_MS], lastBuild: BUILD - 1 })),
    ).toEqual({ ok: false, reason: 'yearly_limit' })
  })

  it('365日より前の依頼は年の枠に数えない（ちょうど365日前は枠の外）', () => {
    expect(YEAR_DAYS).toBe(365)
    expect(
      decideReview(withState({ requests: [NOW - 366 * DAY_MS, NOW - 130 * DAY_MS], lastBuild: BUILD - 1 })),
    ).toEqual({ ok: true })
    expect(
      decideReview(withState({ requests: [NOW - 365 * DAY_MS, NOW - 130 * DAY_MS], lastBuild: BUILD - 1 })),
    ).toEqual({ ok: true })
    expect(
      decideReview(withState({ requests: [NOW - 365 * DAY_MS + 1, NOW - 130 * DAY_MS], lastBuild: BUILD - 1 })),
    ).toEqual({ ok: false, reason: 'yearly_limit' })
  })
})

describe('decideReview — 保存状態と fresh', () => {
  it('壊れていた（corrupt）評価では出さない', () => {
    expect(decideReview(with_({ stateHealth: 'corrupt' }))).toEqual({ ok: false, reason: 'state_unreadable' })
  })

  it('fresh（未保存）は初回記録が無いので too_new になる', () => {
    expect(decideReview(with_({ stateHealth: 'fresh', state: EMPTY_REVIEW_STATE }))).toEqual({
      ok: false,
      reason: 'too_new',
    })
  })
})

describe('decideReview — 強制（開発・ベータの確認用）', () => {
  const EMPTY = { state: EMPTY_REVIEW_STATE }

  it('production 以外で force なら、production の否決と適格・上限を飛ばして通る', () => {
    expect(decideReview(with_({ stage: 'dev', force: true, ...EMPTY }))).toEqual({ ok: true })
    expect(decideReview(with_({ stage: 'beta', force: true, ...EMPTY }))).toEqual({ ok: true })
  })

  it('force でなければ、production 以外は not_production のまま', () => {
    expect(decideReview(with_({ stage: 'dev', force: false }))).toEqual({ ok: false, reason: 'not_production' })
  })

  it('production では force を無視する（適格・上限が効く）', () => {
    expect(decideReview(with_({ stage: 'production', force: true, ...EMPTY }))).toEqual({
      ok: false,
      reason: 'too_new',
    })
  })

  it('force でも安全側の否決は効く（production の否決・適格・上限だけを飛ばす）', () => {
    const SAFETY: ReviewVeto[] = [
      'demo',
      'status_unknown',
      'stopped',
      'notice',
      'diagnostics',
      'maintenance',
      'offline',
      'attendance',
      'near_class',
      'sync_busy',
      'not_home',
      'app_inactive',
      'not_settled',
      'session_requested',
      'state_unreadable',
    ]
    const base = with_({ stage: 'dev', force: true, ...EMPTY })
    const covered = VETOES.filter(([reason]) => SAFETY.includes(reason))
    expect(covered.map(([r]) => r).sort()).toEqual([...SAFETY].sort())
    for (const [reason, make] of covered) {
      expect(decideReview(make(base)), reason).toEqual({ ok: false, reason })
    }
  })

  it('force は適格・上限の否決だけを飛ばす（飛ばす側の対照）', () => {
    const SKIPPED: ReviewVeto[] = ['build_unknown', 'too_new', 'recent_failure', 'few_value_days', 'same_build', 'recent_request', 'yearly_limit']
    const base = with_({ stage: 'dev', force: true, ...EMPTY })
    for (const [reason, make] of VETOES.filter(([r]) => SKIPPED.includes(r))) {
      expect(decideReview(make(base)), reason).toEqual({ ok: true })
    }
  })

  it('force なら自ビルド番号が取れなくても通る（開発ビルドでは取れないことがある）', () => {
    expect(decideReview(with_({ stage: 'dev', force: true, buildNumber: null, ...EMPTY }))).toEqual({ ok: true })
  })
})
