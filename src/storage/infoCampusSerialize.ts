import type { CampusId } from '../info/infoLinks'

const KNOWN: CampusId[] = ['katsushika', 'kagurazaka', 'noda']

/** null = 未選択（すべて表示）を空文字で表す。 */
export function serializeInfoCampus(v: CampusId | null): string {
  return v ?? ''
}

/** 既知のCampusId以外（未選択・未知値・不正）は null。 */
export function deserializeInfoCampus(raw: string | null): CampusId | null {
  return (KNOWN as string[]).includes(raw ?? '') ? (raw as CampusId) : null
}
