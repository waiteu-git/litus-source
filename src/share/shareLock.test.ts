import { describe, it, expect } from 'vitest'
import { canOpenShare, SHARE_LOCK_MS } from './shareLock'

/**
 * 共有シートの二重タップを時刻で切るロック。設計: docs/design/2026-10-09-G-share-to-friends.md §5・§8-9
 * （LinkRow に無効化の props が無く、Android は promise がチューザ表示直後に解決するため、promise 待ちのロックは使えない）
 */
describe('canOpenShare', () => {
  const T = 1_000_000

  it('ロック時間は約1秒', () => {
    expect(SHARE_LOCK_MS).toBe(1000)
  })

  it('初回（直近の押下なし）は開ける', () => {
    expect(canOpenShare(T, null)).toBe(true)
  })

  it('ロック時間内は開けない', () => {
    expect(canOpenShare(T, T)).toBe(false)
    expect(canOpenShare(T + 1, T)).toBe(false)
    expect(canOpenShare(T + SHARE_LOCK_MS - 1, T)).toBe(false)
  })

  it('ちょうど境界・超過は開ける', () => {
    expect(canOpenShare(T + SHARE_LOCK_MS, T)).toBe(true)
    expect(canOpenShare(T + SHARE_LOCK_MS + 1, T)).toBe(true)
  })

  it('時計が戻った（now < lastOpenedAt）は開ける＝永久ロックにしない', () => {
    expect(canOpenShare(T - 1, T)).toBe(true)
    expect(canOpenShare(0, T)).toBe(true)
  })

  it('ロック時間は引数で差し替えられる', () => {
    expect(canOpenShare(T + 50, T, 100)).toBe(false)
    expect(canOpenShare(T + 100, T, 100)).toBe(true)
  })
})
