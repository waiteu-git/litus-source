import { describe, expect, it } from 'vitest'
import { deserializeKillSwitchCache, serializeKillSwitchCache } from './killSwitchSerialize'

const cache = {
  status: { disabledAll: false, disabled: ['letus' as const], message: '一部停止中', title: '停止中' },
  fetchedAt: 1_752_000_000_000,
  build: 78,
}

describe('killSwitchSerialize', () => {
  it('round-trips a cache', () => {
    expect(deserializeKillSwitchCache(serializeKillSwitchCache(cache))).toEqual(cache)
  })

  it('build:null（dev等）もround-tripできる', () => {
    const devCache = { ...cache, build: null }
    expect(deserializeKillSwitchCache(serializeKillSwitchCache(devCache))).toEqual(devCache)
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
      deserializeKillSwitchCache(JSON.stringify({ status: { disabled: 'all' }, fetchedAt: 1, build: 78 })),
    ).toBeNull()
  })

  it('build欄の無い旧形式キャッシュは破棄する（versionRules導入前の保存値を流用しない）', () => {
    expect(deserializeKillSwitchCache(JSON.stringify({ status: cache.status, fetchedAt: 5 }))).toBeNull()
  })

  it('未知の機能名が混じった保存済みキャッシュも既知分だけに正規化して読む', () => {
    const raw = JSON.stringify({
      status: { disabledAll: true, disabled: ['letus', 'future'], message: null },
      fetchedAt: 5,
      build: 78,
    })
    expect(deserializeKillSwitchCache(raw)).toEqual({
      status: { disabledAll: true, disabled: ['letus'], message: null, title: null },
      fetchedAt: 5,
      build: 78,
    })
  })
})
