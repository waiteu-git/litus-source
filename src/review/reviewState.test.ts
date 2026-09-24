import { describe, it, expect } from 'vitest'
import {
  DAY_MS,
  EMPTY_REVIEW_STATE,
  REQUESTS_KEEP,
  VALUE_DAYS_KEEP,
  addValueDay,
  localDayKey,
  mergeFailure,
  parseReviewState,
  recordRequest,
  serializeReviewState,
  type ReviewState,
} from './reviewState'

// 端末ローカルの 2026-09-24 12:00。テスト実行環境のタイムゾーンに依らないよう、必ずローカル生成で作る。
const NOW = new Date(2026, 8, 24, 12, 0, 0).getTime()

const state = (over: Partial<ReviewState> = {}): ReviewState => ({ ...EMPTY_REVIEW_STATE, ...over })

describe('parseReviewState', () => {
  it('保存が無い（null）は fresh で、空の状態を返す', () => {
    expect(parseReviewState(null, NOW)).toEqual({ state: EMPTY_REVIEW_STATE, health: 'fresh' })
  })

  it('serialize した状態はそのまま読み戻せる（ok）', () => {
    const s = state({
      firstSeenAt: NOW - 20 * DAY_MS,
      valueDays: ['20260901', '20260902'],
      requests: [NOW - 200 * DAY_MS],
      lastBuild: 221,
      lastFailureAt: NOW - 30 * DAY_MS,
    })
    expect(parseReviewState(serializeReviewState(s), NOW)).toEqual({ state: s, health: 'ok' })
  })

  it('壊れた JSON は corrupt で「今が初回・今が直近の依頼」になる（14日も120日も待つ側に倒れる）', () => {
    const r = parseReviewState('{not json', NOW)
    expect(r.health).toBe('corrupt')
    expect(r.state.firstSeenAt).toBe(NOW)
    expect(r.state.requests).toEqual([NOW])
    expect(r.state.valueDays).toEqual([])
    expect(r.state.lastFailureAt).toBeNull()
  })

  it.each([
    ['配列', '[]'],
    ['文字列', '"x"'],
    ['数値', '3'],
    ['空文字', ''],
    ['firstSeenAt が文字列', JSON.stringify({ ...EMPTY_REVIEW_STATE, firstSeenAt: 'x' })],
    ['firstSeenAt が NaN 相当（null でも数値でもない）', JSON.stringify({ ...EMPTY_REVIEW_STATE, firstSeenAt: {} })],
    ['valueDays が配列でない', JSON.stringify({ ...EMPTY_REVIEW_STATE, valueDays: 'x' })],
    ['valueDays に不正な日付キー', JSON.stringify({ ...EMPTY_REVIEW_STATE, valueDays: ['2026-09-24'] })],
    ['requests に数値でない要素', JSON.stringify({ ...EMPTY_REVIEW_STATE, requests: ['a'] })],
    ['lastBuild が小数', JSON.stringify({ ...EMPTY_REVIEW_STATE, lastBuild: 1.5 })],
    ['lastBuild が 0', JSON.stringify({ ...EMPTY_REVIEW_STATE, lastBuild: 0 })],
    ['lastFailureAt が文字列', JSON.stringify({ ...EMPTY_REVIEW_STATE, lastFailureAt: 'x' })],
    ['項目が欠けている', JSON.stringify({ firstSeenAt: NOW })],
  ])('構造が違う保存は corrupt: %s', (_name, raw) => {
    expect(parseReviewState(raw, NOW).health).toBe('corrupt')
  })

  it('valueDays は昇順・重複なし・最新30件へ、requests は昇順・最新4件へ正規化する', () => {
    const days = Array.from({ length: 35 }, (_, i) => `2026${String(1 + Math.floor(i / 28)).padStart(2, '0')}${String((i % 28) + 1).padStart(2, '0')}`)
    const raw = JSON.stringify({
      ...EMPTY_REVIEW_STATE,
      valueDays: [...days].reverse().concat(days[0]),
      requests: [5, 1, 4, 2, 3, 6],
    })
    const r = parseReviewState(raw, NOW)
    expect(r.health).toBe('ok')
    expect(r.state.valueDays).toHaveLength(VALUE_DAYS_KEEP)
    expect(r.state.valueDays).toEqual([...r.state.valueDays].sort())
    expect(r.state.valueDays[VALUE_DAYS_KEEP - 1]).toBe(days[days.length - 1])
    expect(new Set(r.state.valueDays).size).toBe(VALUE_DAYS_KEEP)
    expect(r.state.requests).toEqual([3, 4, 5, 6])
    expect(r.state.requests).toHaveLength(REQUESTS_KEEP)
  })
})

describe('localDayKey', () => {
  it('端末ローカルの日付を YYYYMMDD で返す（月日をゼロ埋め）', () => {
    expect(localDayKey(new Date(2026, 0, 5, 3, 4, 5).getTime())).toBe('20260105')
    expect(localDayKey(NOW)).toBe('20260924')
  })

  it('同じローカル日の 00:00 と 23:59 は同じキー、翌日の 00:00 は別のキー', () => {
    expect(localDayKey(new Date(2026, 8, 24, 0, 0, 0).getTime())).toBe('20260924')
    expect(localDayKey(new Date(2026, 8, 24, 23, 59, 59).getTime())).toBe('20260924')
    expect(localDayKey(new Date(2026, 8, 25, 0, 0, 0).getTime())).toBe('20260925')
  })
})

describe('addValueDay', () => {
  it('新しい日を昇順で足す', () => {
    const s = addValueDay(state({ valueDays: ['20260901'] }), '20260902')
    expect(s.valueDays).toEqual(['20260901', '20260902'])
  })

  it('既にある日は何も変えず、同じオブジェクトを返す（呼び出し側が書き込みを省く判定に使う）', () => {
    const s = state({ valueDays: ['20260901'] })
    expect(addValueDay(s, '20260901')).toBe(s)
  })

  it('30件を超えたら最新30件だけ残す', () => {
    const days = Array.from({ length: VALUE_DAYS_KEEP }, (_, i) => `202608${String(i + 1).padStart(2, '0')}`)
    const s = addValueDay(state({ valueDays: days }), '20260901')
    expect(s.valueDays).toHaveLength(VALUE_DAYS_KEEP)
    expect(s.valueDays[0]).toBe('20260802')
    expect(s.valueDays[VALUE_DAYS_KEEP - 1]).toBe('20260901')
  })

  it('30件すべてより古い日（時計が戻った時）は捨てられ、状態は変わらない（同じオブジェクト）', () => {
    const days = Array.from({ length: VALUE_DAYS_KEEP }, (_, i) => `202609${String(i + 1).padStart(2, '0')}`.slice(0, 8))
    const s = state({ valueDays: days })
    expect(addValueDay(s, '20250101')).toBe(s)
  })
})

describe('mergeFailure', () => {
  it('新しい失敗時刻で更新する', () => {
    expect(mergeFailure(state({ lastFailureAt: 100 }), 200).lastFailureAt).toBe(200)
    expect(mergeFailure(state(), 200).lastFailureAt).toBe(200)
  })

  it('古い・同じ時刻では変わらず、同じオブジェクトを返す（単調に増える）', () => {
    const s = state({ lastFailureAt: 200 })
    expect(mergeFailure(s, 100)).toBe(s)
    expect(mergeFailure(s, 200)).toBe(s)
  })
})

describe('recordRequest', () => {
  it('依頼時刻とビルド番号を記録する', () => {
    const s = recordRequest(state(), NOW, 221)
    expect(s.requests).toEqual([NOW])
    expect(s.lastBuild).toBe(221)
  })

  it('最新4件だけ残す', () => {
    const s = recordRequest(state({ requests: [1, 2, 3, 4] }), 5, 221)
    expect(s.requests).toEqual([2, 3, 4, 5])
  })

  it('元の状態を書き換えない', () => {
    const before = state({ requests: [1] })
    recordRequest(before, 2, 221)
    expect(before.requests).toEqual([1])
  })
})
