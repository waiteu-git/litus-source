import { describe, it, expect } from 'vitest'
import { CAMPUSES, CLASS_BULLETIN_URL, allCafeterias, findCafeteria } from './infoLinks'

describe('infoLinks', () => {
  it('3キャンパスを持つ', () => {
    expect(CAMPUSES.map((c) => c.id)).toEqual(['kagurazaka', 'katsushika', 'noda'])
  })
  it('野田カナルは実URL、それ以外は準備中(null)', () => {
    const canal = findCafeteria('noda-canal')
    expect(canal?.url).toBe('https://noda.oneqr.io/shops/shp_14152741b95a689ff066689')
    expect(findCafeteria('noda-akarenga')?.url).toBeNull()
    expect(findCafeteria('kagurazaka-tbd')?.url).toBeNull()
  })
  it('学食idは一意', () => {
    const ids = allCafeterias().map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('全URLはhttpsのみ（表示のみ・平文禁止）', () => {
    for (const c of allCafeterias()) {
      if (c.url) expect(c.url.startsWith('https://')).toBe(true)
    }
  })
  it('掲示URLはCLASSオリジン', () => {
    expect(CLASS_BULLETIN_URL.startsWith('https://class.admin.tus.ac.jp')).toBe(true)
  })
})
