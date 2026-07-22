import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveReleaseStage,
  isPrerelease,
  devBadgeSuffix,
  shouldShowBuildTag,
} from './releaseStage'

describe('resolveReleaseStage', () => {
  it('production だけが出荷物扱い', () => {
    expect(resolveReleaseStage('production')).toBe('production')
    expect(isPrerelease(resolveReleaseStage('production'))).toBe(false)
  })
  it('未設定・未知値は安全側（プレリリース）に倒す', () => {
    for (const raw of [undefined, null, '', 'beta', 'dev', 'PRODUCTION', 'prod']) {
      expect(isPrerelease(resolveReleaseStage(raw))).toBe(true)
    }
  })
})

describe('開発版表記の出し分け', () => {
  it('production では（開発版）とビルドタグを出さない', () => {
    const s = resolveReleaseStage('production')
    expect(devBadgeSuffix(s)).toBe('')
    expect(shouldShowBuildTag(s)).toBe(false)
  })
  it('ベータ配布・開発ビルドでは両方出す（テスターが版を報告できる必要がある）', () => {
    for (const raw of ['beta', 'dev', undefined]) {
      const s = resolveReleaseStage(raw)
      expect(devBadgeSuffix(s)).toBe('（開発版）')
      expect(shouldShowBuildTag(s)).toBe(true)
    }
  })
})

// ラチェット: 表記が再び無条件で直書きされるのを防ぐ
function listSources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listSources(p))
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

describe('外し忘れ防止ラチェット', () => {
  it('（開発版）の直書きは releaseStage.ts とテスト以外に存在しない', () => {
    const offenders: string[] = []
    for (const file of listSources(__dirname)) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      if (rel === 'releaseStage.ts' || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue
      if (readFileSync(file, 'utf8').includes('（開発版）')) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('ホームのビルドタグは shouldShowBuildTag で条件付きになっている', () => {
    const src = readFileSync(join(__dirname, 'screens', 'HomeScreen.tsx'), 'utf8')
    expect(src).toContain('shouldShowBuildTag')
  })

  it('eas.json の production プロファイルがフラグを production に立てている', () => {
    // ここが無いと純関数もラチェットも素通りする（実ビルドに値が入らない）。
    const eas = JSON.parse(readFileSync(join(__dirname, '..', 'eas.json'), 'utf8'))
    expect(eas.build.production.env.EXPO_PUBLIC_RELEASE_STAGE).toBe('production')
  })
})
