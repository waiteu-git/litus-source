import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { findStaticImportsOf } from '../nativeModuleGuard'

const ASYNC_STORAGE = '@react-native-async-storage/async-storage'

/**
 * ファサード自身だけが AsyncStorage を直接 import してよい。
 *
 * 迂回すると、デモモード中に実ユーザーのデータを壊す。デモ名前空間は
 * src/storage/asyncStorage.ts のキー変換でしか適用されないため、直接
 * AsyncStorage を呼ぶと `demo:` 前置を通らず実キーへ書き込んでしまう。
 */
const ALLOW = new Set(['storage/asyncStorage.ts'])

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

describe('AsyncStorageファサードのガード（ラチェット）', () => {
  it('asyncStorage.ts 以外は AsyncStorage を直接 import しない', () => {
    const srcDir = join(__dirname, '..')
    const offenders: string[] = []
    for (const file of listSources(srcDir)) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      if (ALLOW.has(rel)) continue
      if (findStaticImportsOf(readFileSync(file, 'utf8'), [ASYNC_STORAGE]).length > 0) {
        offenders.push(rel)
      }
    }
    expect(offenders).toEqual([])
  })
})
