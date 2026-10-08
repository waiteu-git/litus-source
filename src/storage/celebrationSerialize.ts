import type { CelebrationChoice } from '../celebration/celebration'

/**
 * お祝いデザインの選択のserialize。**'on' と 'off' だけを通し、それ以外（null・空・壊れたJSON・想定外の値）は
 * 未選択（null）**。未選択は「期間内ならオン」と読まれる（celebration.ts）。
 */
export function serializeCelebrationChoice(choice: Exclude<CelebrationChoice, null>): string {
  return JSON.stringify(choice)
}

export function deserializeCelebrationChoice(raw: string | null): CelebrationChoice {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    return v === 'on' || v === 'off' ? v : null
  } catch {
    return null
  }
}
