import { describe, expect, it } from 'vitest'
import { deserializeKillSwitchCache, serializeKillSwitchCache } from './killSwitchSerialize'

const cache = {
  status: { disabledAll: false, disabled: ['letus' as const], message: '一部停止中' },
  fetchedAt: 1_752_000_000_000,
}

describe('killSwitchSerialize', () => {
  it('round-trips a cache', () => {
    expect(deserializeKillSwitchCache(serializeKillSwitchCache(cache))).toEqual(cache)
  })

  it('treats null as null（キャッシュ無し＝fail-open）', () => {
    expect(deserializeKillSwitchCache(null)).toBeNull()
  })

  it('treats broken JSON as null', () => {
    expect(deserializeKillSwitchCache('{not json')).toBeNull()
  })

  it('treats shape mismatch as null', () => {
    expect(deserializeKillSwitchCache(JSON.stringify({ fetchedAt: 1 }))).toBeNull()
    expect(deserializeKillSwitchCache(JSON.stringify({ status: cache.status }))).toBeNull()
    expect(
      deserializeKillSwitchCache(JSON.stringify({ status: { disabled: 'all' }, fetchedAt: 1 })),
    ).toBeNull()
  })

  it('未知の機能名が混じった保存済みキャッシュも既知分だけに正規化して読む', () => {
    const raw = JSON.stringify({
      status: { disabledAll: true, disabled: ['letus', 'future'], message: null },
      fetchedAt: 5,
    })
    expect(deserializeKillSwitchCache(raw)).toEqual({
      status: { disabledAll: true, disabled: ['letus'], message: null },
      fetchedAt: 5,
    })
  })
})
