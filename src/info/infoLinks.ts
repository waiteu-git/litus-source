/** インフォタブの静的データ（キャンパス×サービス種別のリンク集）。純粋データ・RN非依存。 */

export type CampusId = 'katsushika' | 'kagurazaka' | 'noda'
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

  // --- 図書館（実URLは後続で確定。確定まで準備中） ---
  { id: 'katsushika-library', campusId: 'katsushika', category: 'library', name: '葛飾図書館', url: null },
  { id: 'kagurazaka-library', campusId: 'kagurazaka', category: 'library', name: '神楽坂図書館', url: null },
  { id: 'noda-library', campusId: 'noda', category: 'library', name: '野田図書館', url: null },

  // --- 最寄り駅の時刻表（Yahoo!路線情報。実URLは後続で確定） ---
  { id: 'katsushika-station', campusId: 'katsushika', category: 'station', name: '金町駅 / 京成金町駅', url: null },
  { id: 'kagurazaka-station', campusId: 'kagurazaka', category: 'station', name: '飯田橋駅 / 神楽坂駅', url: null },
  { id: 'noda-station', campusId: 'noda', category: 'station', name: '運河駅', url: null },
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
