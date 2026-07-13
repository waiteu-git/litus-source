import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
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

// ラチェット: allowlist外のscreenファイルに生色があれば失敗
function listTsx(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listTsx(p))
    else if (e.name.endsWith('.tsx')) out.push(p)
  }
  return out
}

describe('生色ガード（ラチェット）', () => {
  it('allowlist外のsrc/screensファイルは生色ゼロ', () => {
    const screensDir = join(__dirname, '..', 'screens')
    if (!existsSync(screensDir)) return
    const allow: string[] = JSON.parse(
      readFileSync(join(__dirname, 'rawColorGuard.allowlist.json'), 'utf8'),
    )
    const allowSet = new Set(allow)
    const offenders: string[] = []
    for (const file of listTsx(screensDir)) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      if (allowSet.has(rel)) continue
      if (findRawColors(readFileSync(file, 'utf8')).length > 0) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
