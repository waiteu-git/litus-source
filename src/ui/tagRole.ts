import type { UiColors } from '../theme.tokens'

/** 意味色role。neutral=通常のカテゴリピル、他は「色が付いている＝異常」の意味色。 */
export type TagRole = 'neutral' | 'danger' | 'warn' | 'info' | 'success'
/** sm=一覧用（詰まった行）、md=詳細用。B-1の2グループを吸収。 */
export type TagSize = 'sm' | 'md'

/** role→背景/文字色。純粋＝RN非依存でvitest可能。 */
export function tagRoleColors(colors: UiColors, role: TagRole): { bg: string; text: string } {
  switch (role) {
    case 'danger':
      return { bg: colors.dangerBg, text: colors.danger }
    case 'warn':
      return { bg: colors.warnBg, text: colors.warn }
    case 'info':
      return { bg: colors.infoBg, text: colors.info }
    case 'success':
      return { bg: colors.successBg, text: colors.success }
    default:
      return { bg: colors.pillBg, text: colors.pillText }
  }
}

/** size→padding/font。虚偽の'800'は使わない（Plexは700まで）。 */
export function tagSizeStyle(size: TagSize): { padH: number; padV: number; fontSize: number; fontWeight: '600' | '700' } {
  return size === 'sm'
    ? { padH: 8, padV: 2, fontSize: 10, fontWeight: '700' }
    : { padH: 10, padV: 3, fontSize: 12, fontWeight: '600' }
}
