import { describe, it, expect } from 'vitest'
import {
  CAMPUS_DEFS,
  CATEGORY_DEFS,
  CLASS_BULLETIN_URL,
  INFO_ITEMS,
  allItems,
  findItem,
  itemsFor,
  itemsForCampus,
  type CampusId,
  type InfoCategory,
} from './infoLinks'

const CAMPUS_IDS: CampusId[] = ['katsushika', 'kagurazaka', 'noda', 'oshamambe']
const CATEGORY_IDS: InfoCategory[] = ['cafeteria', 'library', 'station']

describe('infoLinks', () => {
  it('キャンパス定義は葛飾→神楽坂→野田→長万部の順', () => {
    expect(CAMPUS_DEFS.map((c) => c.id)).toEqual(['katsushika', 'kagurazaka', 'noda', 'oshamambe'])
  })

  it('種別定義は学食→図書館→最寄り駅の時刻表の順', () => {
    expect(CATEGORY_DEFS.map((c) => c.id)).toEqual(['cafeteria', 'library', 'station'])
  })

  it('全idは一意', () => {
    const ids = allItems().map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('全itemのcampusId/categoryは定義済みの値', () => {
    for (const i of INFO_ITEMS) {
      expect(CAMPUS_IDS).toContain(i.campusId)
      expect(CATEGORY_IDS).toContain(i.category)
    }
  })

  it('全URLはnullまたはhttpsのみ（平文禁止）', () => {
    for (const i of INFO_ITEMS) {
      if (i.url !== null) expect(i.url.startsWith('https://')).toBe(true)
    }
  })

  it('既存学食idを維持（お気に入り互換）', () => {
    expect(findItem('noda-canal')?.url).toBe('https://noda.oneqr.io/shops/shp_14152741b95a689ff066689')
    expect(findItem('noda-akarenga')?.url).toBeNull()
    expect(findItem('kagurazaka-tbd')?.category).toBe('cafeteria')
  })

  it('itemsForCampusは該当キャンパスのみ返す', () => {
    for (const i of itemsForCampus('noda')) expect(i.campusId).toBe('noda')
  })

  it('itemsForはキャンパス×種別で絞り込む', () => {
    for (const i of itemsFor('noda', 'cafeteria')) {
      expect(i.campusId).toBe('noda')
      expect(i.category).toBe('cafeteria')
    }
    expect(itemsFor('noda', 'cafeteria').map((i) => i.id)).toContain('noda-canal')
  })

  it('各キャンパスに図書館・最寄り駅の項目が1つ以上ある', () => {
    for (const c of CAMPUS_IDS) {
      expect(itemsFor(c, 'library').length).toBeGreaterThan(0)
      expect(itemsFor(c, 'station').length).toBeGreaterThan(0)
    }
  })

  it('図書館は全て統合ポータルtuslibraryを指す', () => {
    const libs = INFO_ITEMS.filter((i) => i.category === 'library')
    expect(libs.length).toBeGreaterThan(0)
    for (const i of libs) expect(i.url).toBe('https://tuslibrary.admin.tus.ac.jp/')
  })

  it('駅項目は全てYahoo路線情報の時刻表を指す', () => {
    const stations = INFO_ITEMS.filter((i) => i.category === 'station')
    expect(stations.length).toBeGreaterThan(0)
    for (const i of stations) expect(i.url?.startsWith('https://transit.yahoo.co.jp/timetable/')).toBe(true)
  })

  it('葛飾は金町・京成金町の2駅を持つ', () => {
    expect(itemsFor('katsushika', 'station').map((i) => i.name)).toEqual(['金町駅', '京成金町駅'])
  })

  it('掲示URLはCLASSオリジン', () => {
    expect(CLASS_BULLETIN_URL.startsWith('https://class.admin.tus.ac.jp')).toBe(true)
  })
})
