import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { formatBuildTag, formatVersionLabel } from './appVersion'

describe('formatVersionLabel', () => {
  it('version と build を併記する', () => {
    expect(formatVersionLabel('1.0.0', 75)).toBe('v1.0.0 (build 75)')
    expect(formatVersionLabel('1.0.0', '76')).toBe('v1.0.0 (build 76)')
  })

  it('build 欠落時は version のみ', () => {
    expect(formatVersionLabel('1.2.0', null)).toBe('v1.2.0')
    expect(formatVersionLabel('1.2.0', undefined)).toBe('v1.2.0')
    expect(formatVersionLabel('1.2.0', '')).toBe('v1.2.0')
  })

  it('version 欠落時は 1.0.0 にフォールバック', () => {
    expect(formatVersionLabel(null, 80)).toBe('v1.0.0 (build 80)')
    expect(formatVersionLabel('', 80)).toBe('v1.0.0 (build 80)')
    expect(formatVersionLabel(undefined, undefined)).toBe('v1.0.0')
  })
})

describe('formatBuildTag', () => {
  it('versionCode から vNN 形式のタグを作る', () => {
    expect(formatBuildTag(76)).toBe('v76')
    expect(formatBuildTag('76')).toBe('v76')
  })

  it('前後空白は除去する', () => {
    expect(formatBuildTag(' 76 ')).toBe('v76')
  })

  it('build 欠落時（Expo Go 等）は dev にフォールバック', () => {
    expect(formatBuildTag(null)).toBe('dev')
    expect(formatBuildTag(undefined)).toBe('dev')
    expect(formatBuildTag('')).toBe('dev')
    expect(formatBuildTag('   ')).toBe('dev')
  })
})

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listSources(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * ラチェット: バージョン値の取得元が expo-constants に戻るのを防ぐ。
 *
 * `Constants.nativeAppVersion` / `Constants.nativeBuildVersion` は expo-constants で非推奨化され、
 * **実装から代入が消えている**（型だけ残るので TypeScript も通り、値は常に undefined）。
 * このため build 105 まで、ホームのビルドタグは常に `dev` にフォールバックし
 * （＝どのビルドを触っているかテスターが報告できない）、kill switch の `versionRules` は
 * 自ビルド番号が null で**一度も適用されなかった**（＝版を絞った緊急停止が効かない）。
 * どちらも型チェックもテストも素通りし、起動して目視するまで分からなかった。
 *
 * 後継は expo-application（expo-notifications の依存として既にネイティブへリンク済み）。
 */
describe('バージョン値の取得元ラチェット', () => {
  const DEAD_APIS = ['Constants.nativeAppVersion', 'Constants.nativeBuildVersion'] as const

  it('expo-constants の廃止済みバージョンAPIを読んでいるソースは無い', () => {
    const offenders: string[] = []
    for (const file of listSources(__dirname)) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      const src = readFileSync(file, 'utf8')
      for (const api of DEAD_APIS) {
        if (src.includes(api)) offenders.push(`${rel} → ${api}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
