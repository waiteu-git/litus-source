import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { findRawColors } from './rawColorGuard'

describe('findRawColors', () => {
  it('生hexとrgbaを検出する', () => {
    expect(findRawColors("color: '#e0533a'")).toEqual(['#e0533a'])
    expect(findRawColors('bg: rgba(255,0,0,0.5)')).toEqual(['rgba(255,0,0,0.5)'])
  })
  it('design-allow 行と非色は無視する', () => {
    expect(findRawColors("color: '#e0533a' // design-allow")).toEqual([])
    expect(findRawColors("const id = 'abc123'")).toEqual([])
    expect(findRawColors('const n = 123456')).toEqual([])
  })
})

// ラチェット: allowlist外の src 配下の .tsx（画面・部品・Provider すべて）に生色があれば失敗
const SRC = join(__dirname, '..')

function listTsx(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listTsx(p))
    else if (e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) out.push(p)
  }
  return out
}
const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/')

describe('生色ガード（ラチェット）', () => {
  const files = listTsx(SRC)

  it('走査対象が実在する（形骸化の防止）: screens・home・ui・attendance の .tsx を含む', () => {
    const rels = files.map(rel)
    expect(rels).toContain('screens/HomeScreen.tsx')
    expect(rels).toContain('home/QuickTilesSection.tsx')
    expect(rels).toContain('ui/screen.tsx')
    expect(rels).toContain('attendance/AttendanceEngineProvider.tsx')
  })

  it('陰性の対照: 実物から design-allow を外すと生色が検出される（走査が実物の上で効いている）', () => {
    const src = readFileSync(join(SRC, 'ui', 'screen.tsx'), 'utf8')
    expect(findRawColors(src)).toEqual([])
    expect(findRawColors(src.replaceAll('// design-allow', '')).length).toBeGreaterThan(0)
  })

  it('allowlist外の src 配下 .tsx は生色ゼロ', () => {
    const allow: string[] = JSON.parse(
      readFileSync(join(__dirname, 'rawColorGuard.allowlist.json'), 'utf8'),
    )
    const allowSet = new Set(allow)
    const offenders: string[] = []
    for (const file of files) {
      const r = rel(file)
      if (allowSet.has(r)) continue
      if (findRawColors(readFileSync(file, 'utf8')).length > 0) offenders.push(r)
    }
    expect(offenders).toEqual([])
  })
})
