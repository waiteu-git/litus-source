/** インフォタブの静的データ（キャンパス×サービス種別のリンク集）。純粋データ・RN非依存。 */

export type CampusId = 'katsushika' | 'kagurazaka' | 'noda' | 'oshamambe'
export type InfoCategory = 'cafeteria' | 'library' | 'station'

export type InfoItem = {
  id: string
  campusId: CampusId
  category: InfoCategory
  name: string
  url: string | null // null = 準備中
}

/** 表示順（配列順がそのまま画面の並び）。 */
export const CAMPUS_DEFS: { id: CampusId; name: string }[] = [
  { id: 'katsushika', name: '葛飾キャンパス' },
  { id: 'kagurazaka', name: '神楽坂キャンパス' },
  { id: 'noda', name: '野田キャンパス' },
  { id: 'oshamambe', name: '長万部キャンパス' },
]

export const CATEGORY_DEFS: { id: InfoCategory; label: string }[] = [
  { id: 'cafeteria', label: '学食' },
  { id: 'library', label: '図書館' },
  { id: 'station', label: '最寄り駅の時刻表' },
]

export const INFO_ITEMS: InfoItem[] = [
  // --- 学食（既存ID維持） ---
  { id: 'kagurazaka-tbd', campusId: 'kagurazaka', category: 'cafeteria', name: '学食', url: null },
  { id: 'katsushika-tbd', campusId: 'katsushika', category: 'cafeteria', name: '学食', url: null },
  {
    id: 'noda-canal',
    campusId: 'noda',
    category: 'cafeteria',
    name: 'カナル',
    url: 'https://noda.oneqr.io/shops/shp_14152741b95a689ff066689',
  },
  { id: 'noda-akarenga', campusId: 'noda', category: 'cafeteria', name: '赤レンガ', url: null },

  // --- 図書館（統合ポータル。全キャンパス共通のtuslibraryを開く） ---
  { id: 'katsushika-library', campusId: 'katsushika', category: 'library', name: '図書館', url: 'https://tuslibrary.admin.tus.ac.jp/' },
  { id: 'kagurazaka-library', campusId: 'kagurazaka', category: 'library', name: '図書館', url: 'https://tuslibrary.admin.tus.ac.jp/' },
  { id: 'noda-library', campusId: 'noda', category: 'library', name: '図書館', url: 'https://tuslibrary.admin.tus.ac.jp/' },
  { id: 'oshamambe-library', campusId: 'oshamambe', category: 'library', name: '図書館', url: 'https://tuslibrary.admin.tus.ac.jp/' },

  // --- 最寄り駅の時刻表（Yahoo!路線情報の駅時刻表ページ） ---
  { id: 'katsushika-station-kanamachi', campusId: 'katsushika', category: 'station', name: '金町駅', url: 'https://transit.yahoo.co.jp/timetable/22598' },
  { id: 'katsushika-station-keisei-kanamachi', campusId: 'katsushika', category: 'station', name: '京成金町駅', url: 'https://transit.yahoo.co.jp/timetable/22662' },
  { id: 'kagurazaka-station', campusId: 'kagurazaka', category: 'station', name: '飯田橋駅', url: 'https://transit.yahoo.co.jp/timetable/22507' },
  { id: 'noda-station', campusId: 'noda', category: 'station', name: '運河駅', url: 'https://transit.yahoo.co.jp/timetable/22207' },
  { id: 'oshamambe-station', campusId: 'oshamambe', category: 'station', name: '長万部駅', url: 'https://transit.yahoo.co.jp/timetable/20089' },
]

export const CLASS_BULLETIN_URL = 'https://class.admin.tus.ac.jp/'

export function allItems(): InfoItem[] {
  return INFO_ITEMS
}

export function itemsForCampus(campusId: CampusId): InfoItem[] {
  return INFO_ITEMS.filter((i) => i.campusId === campusId)
}

export function itemsFor(campusId: CampusId, category: InfoCategory): InfoItem[] {
  return INFO_ITEMS.filter((i) => i.campusId === campusId && i.category === category)
}

export function findItem(id: string): InfoItem | undefined {
  return INFO_ITEMS.find((i) => i.id === id)
}
