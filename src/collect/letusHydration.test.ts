/**
 * LETUS ハイドレーション待ち（spec§6・T5）のテスト。
 *
 * 注入JSは本来 WebView の DOM 上で動くが、本リポは jsdom を足さない方針のため、
 * LETUS_HYDRATION_PRELUDE の litusWaitForHydration を偽の document / MutationObserver / タイマで
 * 実行して、①同期 ready の高速パス（Observer 不生成＝現行 4.5.8 の挙動ゼロ変更）②変異→debounce→
 * 再スキャンでの ready 検知 ③総額 budget での必ずの打ち切り、を実測で固定する。
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  LETUS_HYDRATION_PRELUDE,
  COLLECT_MYCOURSES_JS,
  COLLECT_COURSE_PAGE_JS,
  COLLECT_ASSIGNMENT_PAGE_JS,
} from './injectedScripts'

/** prelude を評価して litusWaitForHydration を取り出す。document / MutationObserver は注入する。 */
function buildWaiter(mutationObserver: unknown) {
  const factory = new Function(
    'document',
    'MutationObserver',
    `${LETUS_HYDRATION_PRELUDE}\n; return litusWaitForHydration;`,
  )
  const holder: { mo: FakeMO | null } = { mo: null }
  class FakeMO {
    cb: () => void
    observed = false
    disconnected = false
    constructor(cb: () => void) {
      this.cb = cb
      holder.mo = this
    }
    observe() {
      this.observed = true
    }
    disconnect() {
      this.disconnected = true
    }
  }
  const fakeDoc = { documentElement: {} }
  const MO = mutationObserver === 'fake' ? FakeMO : mutationObserver
  const fn = factory(fakeDoc, MO) as (isReady: () => boolean, collect: () => void) => void
  return { fn, holder }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('litusWaitForHydration', () => {
  it('同期 ready は即 collect し Observer を作らない（高速パス）', () => {
    const { fn, holder } = buildWaiter('fake')
    let collected = 0
    fn(() => true, () => (collected += 1))
    expect(collected).toBe(1)
    expect(holder.mo).toBe(null) // Observer 未生成
  })

  it('未 ready → 変異後に ready なら debounce(300ms) 経て collect し disconnect', () => {
    vi.useFakeTimers()
    const { fn, holder } = buildWaiter('fake')
    let ready = false
    let collected = 0
    fn(() => ready, () => (collected += 1))
    expect(holder.mo?.observed).toBe(true)
    expect(collected).toBe(0)

    // まだ未 ready の変異 → 再スキャンしても collect しない。
    holder.mo!.cb()
    vi.advanceTimersByTime(300)
    expect(collected).toBe(0)

    // ready 化した変異 → debounce 後に collect し、Observer を切る。
    ready = true
    holder.mo!.cb()
    vi.advanceTimersByTime(300)
    expect(collected).toBe(1)
    expect(holder.mo?.disconnected).toBe(true)

    // budget 到達しても二重 collect しない。
    vi.advanceTimersByTime(3000)
    expect(collected).toBe(1)
  })

  it('永久に未 ready でも budget(3000ms) で必ず1回 collect して打ち切る', () => {
    vi.useFakeTimers()
    const { fn, holder } = buildWaiter('fake')
    let collected = 0
    fn(() => false, () => (collected += 1))
    holder.mo!.cb() // 変異は起きるが ready にならない
    vi.advanceTimersByTime(300)
    expect(collected).toBe(0)
    vi.advanceTimersByTime(2699)
    expect(collected).toBe(0)
    vi.advanceTimersByTime(1) // 3000ms 到達
    expect(collected).toBe(1)
    expect(holder.mo?.disconnected).toBe(true)
  })

  it('MutationObserver 非対応環境では即 collect（劣化しても空にしない）', () => {
    const { fn, holder } = buildWaiter(undefined) // typeof MutationObserver !== 'function'
    let collected = 0
    fn(() => false, () => (collected += 1))
    expect(collected).toBe(1)
    expect(holder.mo).toBe(null)
  })
})

describe('COLLECT_* 注入JS はハイドレーション待ちを URL 方式で組み込む（ラチェット）', () => {
  const scripts: [string, string][] = [
    ['COLLECT_MYCOURSES_JS', COLLECT_MYCOURSES_JS],
    ['COLLECT_COURSE_PAGE_JS', COLLECT_COURSE_PAGE_JS],
    ['COLLECT_ASSIGNMENT_PAGE_JS', COLLECT_ASSIGNMENT_PAGE_JS],
  ]

  it.each(scripts)('%s は litusWaitForHydration と isReady を持つ', (_name, js) => {
    expect(js).toContain('litusWaitForHydration(')
    expect(js).toContain('function isReady(')
  })

  it('Dashboard 収集の ready 判定は course/view.php アンカー（URL方式）', () => {
    expect(COLLECT_MYCOURSES_JS).toContain('/course/view.php?id=')
  })

  it('コースページ収集の ready 判定は /mod/*/view.php アンカー（URL方式・CSSクラス非依存）', () => {
    expect(COLLECT_COURSE_PAGE_JS).toMatch(/href\*="\/mod\/"/)
    expect(COLLECT_COURSE_PAGE_JS).toContain('view.php')
  })

  it('活動ページ収集の ready 判定は course/view.php パンくずリンク（URL方式）', () => {
    expect(COLLECT_ASSIGNMENT_PAGE_JS).toContain('/course/view.php')
  })
})
