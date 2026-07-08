/** インフォタブの静的データ（学食・CLASS掲示）。純粋データ・RN非依存。今後キャンパス/学食は配列に追加する。 */

export type Cafeteria = { id: string; name: string; url: string | null } // url:null = 準備中
export type Campus = { id: string; name: string; cafeterias: Cafeteria[] }

export const CAMPUSES: Campus[] = [
  { id: 'kagurazaka', name: '神楽坂キャンパス', cafeterias: [{ id: 'kagurazaka-tbd', name: '（準備中）', url: null }] },
  { id: 'katsushika', name: '葛飾キャンパス', cafeterias: [{ id: 'katsushika-tbd', name: '（準備中）', url: null }] },
  {
    id: 'noda',
    name: '野田キャンパス',
    cafeterias: [
      { id: 'noda-canal', name: 'カナル', url: 'https://noda.oneqr.io/shops/shp_14152741b95a689ff066689' },
      { id: 'noda-akarenga', name: '赤レンガ', url: null },
    ],
  },
]

export const CLASS_BULLETIN_URL = 'https://class.admin.tus.ac.jp/'

export function allCafeterias(): Cafeteria[] {
  return CAMPUSES.flatMap((c) => c.cafeterias)
}

export function findCafeteria(id: string): Cafeteria | undefined {
  return allCafeterias().find((c) => c.id === id)
}
