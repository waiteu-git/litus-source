/**
 * アプリ内ストア評価依頼（F）の保存状態と、その純粋な更新（RN非依存・vitest対象）。
 * 設計: docs/design/2026-09-24-F-store-review-prompt.md §4.2〜4.4・§10
 *
 * 保存は src/storage/reviewStateStore.ts（AsyncStorage ファサード経由）が担う。ここは形と更新だけ。
 * 壊れた保存は「今が初回・今が直近の依頼」として読み直す＝14日も120日も待つ側（しつこくない側）に倒れる。
 */

export const DAY_MS = 24 * 60 * 60 * 1000
export const VALUE_DAYS_KEEP = 30
export const REQUESTS_KEEP = 4

export type ReviewState = {
  /** 更新後にホームが初めて前面に出た時刻（epoch ms）。null＝まだ書いていない。 */
  firstSeenAt: number | null
  /** 価値のあった運用日（端末ローカルの 'YYYYMMDD'・昇順・最新30件）。 */
  valueDays: string[]
  /** 依頼を出した時刻（昇順・最新4件）。 */
  requests: number[]
  /** 最後に依頼を出したビルド番号。 */
  lastBuild: number | null
  /** 観測した最後の失敗の時刻。単調に増える（回復後も残す）。 */
  lastFailureAt: number | null
}

export type ReviewStateHealth = 'ok' | 'fresh' | 'corrupt'

export const EMPTY_REVIEW_STATE: ReviewState = {
  firstSeenAt: null,
  valueDays: [],
  requests: [],
  lastBuild: null,
  lastFailureAt: null,
}

export function serializeReviewState(s: ReviewState): string {
  return JSON.stringify(s)
}

const DAY_KEY = /^\d{8}$/
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

function corrupt(now: number): { state: ReviewState; health: ReviewStateHealth } {
  return {
    state: { firstSeenAt: now, valueDays: [], requests: [now], lastBuild: null, lastFailureAt: null },
    health: 'corrupt',
  }
}

/**
 * 保存文字列を状態へ読む。null（未保存）は fresh、構造が1つでも違えば corrupt。
 * 部分的に読める項目だけ拾うことはしない（拾うと「一部だけ古い状態」が待ちを短くしうる）。
 */
export function parseReviewState(
  raw: string | null,
  now: number,
): { state: ReviewState; health: ReviewStateHealth } {
  if (raw === null) return { state: EMPTY_REVIEW_STATE, health: 'fresh' }
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return corrupt(now)
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return corrupt(now)
  const o = v as Record<string, unknown>
  const { firstSeenAt, valueDays, requests, lastBuild, lastFailureAt } = o
  if (firstSeenAt !== null && !isTime(firstSeenAt)) return corrupt(now)
  if (!Array.isArray(valueDays) || !valueDays.every((d) => typeof d === 'string' && DAY_KEY.test(d))) {
    return corrupt(now)
  }
  if (!Array.isArray(requests) || !requests.every(isTime)) return corrupt(now)
  if (lastBuild !== null && !(typeof lastBuild === 'number' && Number.isInteger(lastBuild) && lastBuild > 0)) {
    return corrupt(now)
  }
  if (lastFailureAt !== null && !isTime(lastFailureAt)) return corrupt(now)
  // 未来の時刻は今へ丸める。端末の時計が進んだ間に書いた値が残ると、待ちが時計のずれの分だけ
  // 永続する（「今から14日」ではなく「未来の日付から14日」になる）。丸めても待つ側＝しつこくない側に
  // 倒れ、期間は有限になる。呼び出し側（reviewStateStore）が丸めた結果を書き戻して自己回復させる。
  const today = localDayKey(now)
  return {
    state: {
      firstSeenAt: firstSeenAt === null ? null : Math.min(firstSeenAt as number, now),
      valueDays: [...new Set(valueDays as string[])]
        .filter((d) => d <= today)
        .sort()
        .slice(-VALUE_DAYS_KEEP),
      requests: (requests as number[])
        .map((t) => Math.min(t, now))
        .sort((a, b) => a - b)
        .slice(-REQUESTS_KEEP),
      lastBuild: lastBuild as number | null,
      lastFailureAt: lastFailureAt === null ? null : Math.min(lastFailureAt as number, now),
    },
    health: 'ok',
  }
}

/** 端末ローカルの日付キー（'YYYYMMDD'）。 */
export function localDayKey(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w: number) => String(n).padStart(w, '0')
  return `${p(d.getFullYear(), 4)}${p(d.getMonth() + 1, 2)}${p(d.getDate(), 2)}`
}

/** 価値のあった日を足す。変わらない時は同じオブジェクトを返す（呼び出し側が書き込みを省く）。 */
export function addValueDay(s: ReviewState, day: string): ReviewState {
  if (s.valueDays.includes(day)) return s
  const days = [...s.valueDays, day].sort().slice(-VALUE_DAYS_KEEP)
  if (days.length === s.valueDays.length && days.every((d, i) => d === s.valueDays[i])) return s
  return { ...s, valueDays: days }
}

/** 観測した失敗時刻を取り込む。単調に増えるだけ（古い・同じなら同じオブジェクトを返す）。 */
export function mergeFailure(s: ReviewState, at: number): ReviewState {
  if (s.lastFailureAt !== null && s.lastFailureAt >= at) return s
  return { ...s, lastFailureAt: at }
}

/** 依頼を出したことを記録する。 */
export function recordRequest(s: ReviewState, now: number, build: number | null): ReviewState {
  return {
    ...s,
    requests: [...s.requests, now].sort((a, b) => a - b).slice(-REQUESTS_KEEP),
    lastBuild: build,
  }
}
