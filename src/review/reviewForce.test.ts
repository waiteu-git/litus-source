import { describe, it, expect, afterEach, vi } from 'vitest'

// REVIEW_FORCE はモジュール評価時にビルド時の環境変数から決まる。環境ごとに読み直して確かめる。
async function loadForce(stage: string | undefined, force: string | undefined): Promise<boolean> {
  vi.resetModules()
  vi.unstubAllEnvs()
  if (stage !== undefined) vi.stubEnv('EXPO_PUBLIC_RELEASE_STAGE', stage)
  else vi.stubEnv('EXPO_PUBLIC_RELEASE_STAGE', '')
  if (force !== undefined) vi.stubEnv('EXPO_PUBLIC_REVIEW_FORCE', force)
  else vi.stubEnv('EXPO_PUBLIC_REVIEW_FORCE', '')
  return (await import('./reviewForce')).REVIEW_FORCE
}

describe('REVIEW_FORCE（開発・ベータでの確認用の強制）', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('production では EXPO_PUBLIC_REVIEW_FORCE=1 でも常に false', async () => {
    expect(await loadForce('production', '1')).toBe(false)
  })

  it('dev（未設定も dev 扱い）・beta では =1 の時だけ true', async () => {
    expect(await loadForce('beta', '1')).toBe(true)
    expect(await loadForce('dev', '1')).toBe(true)
    expect(await loadForce(undefined, '1')).toBe(true)
  })

  it('=1 以外（未設定・0・true）は false', async () => {
    expect(await loadForce('beta', undefined)).toBe(false)
    expect(await loadForce('beta', '0')).toBe(false)
    expect(await loadForce('beta', 'true')).toBe(false)
  })
})
