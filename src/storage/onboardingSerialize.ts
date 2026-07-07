/** 初回チュートリアル完了フラグのserialize。null/壊れJSON/非booleanは false（=初回扱い）。 */
export function serializeOnboardingDone(done: boolean): string {
  return JSON.stringify(done)
}

export function deserializeOnboardingDone(raw: string | null): boolean {
  if (!raw) return false
  try {
    return JSON.parse(raw) === true
  } catch {
    return false
  }
}
