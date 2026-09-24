import { Storage } from './asyncStorage'
import {
  parseReviewState,
  serializeReviewState,
  type ReviewState,
  type ReviewStateHealth,
} from '../review/reviewState'

/**
 * 評価依頼（F）の保存状態。純粋な形・更新は src/review/reviewState.ts、ここは AsyncStorage ファサード経由の
 * 読み書きだけ（デモ名前空間を迂回しない）。設計: docs/design/2026-09-24-F-store-review-prompt.md §4.2
 *
 * 書き手はホームの useStoreReviewPrompt だけ。読み込みと書き込みを1本の鎖に載せて直列化する
 * （価値日・失敗の取り込みと依頼の記録が同時に走っても、どれも失われない）。
 * 読み書きが例外になった時は書かずに reject する＝呼び出し側はその評価を見送る（出さない側へ倒す）。
 */
export const REVIEW_STATE_KEY = 'review.state.v1'

export type LoadedReviewState = { state: ReviewState; health: ReviewStateHealth }

async function readAndRepair(now: number): Promise<LoadedReviewState> {
  const raw = await Storage.getItem(REVIEW_STATE_KEY)
  const parsed = parseReviewState(raw, now)
  // 壊れた保存は「今が初回・今が直近の依頼」へ直して書き戻す。読むたびに壊れたままだと、
  // 壊れた時刻ではなく読んだ時刻が毎回の「今」になり、待ちが永久に終わらない。
  if (parsed.health === 'corrupt') await Storage.setItem(REVIEW_STATE_KEY, serializeReviewState(parsed.state))
  return parsed
}

let chain: Promise<unknown> = Promise.resolve()

/**
 * 状態を読み、fn で更新し、変わった時（fn が別のオブジェクトを返した時）だけ書く。
 * 返り値の health は読んだ時点のもの（fresh でも、fn が書けば以後は ok）。
 */
export function mutateReviewState(
  now: number,
  fn: (s: ReviewState) => ReviewState | Promise<ReviewState>,
): Promise<LoadedReviewState> {
  const run = chain.then(async () => {
    const { state, health } = await readAndRepair(now)
    const next = await fn(state)
    if (next !== state) await Storage.setItem(REVIEW_STATE_KEY, serializeReviewState(next))
    return { state: next, health }
  })
  chain = run.catch(() => undefined)
  return run
}

export function loadReviewState(now: number): Promise<LoadedReviewState> {
  return mutateReviewState(now, (s) => s)
}
