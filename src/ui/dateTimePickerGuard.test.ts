import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { findStaticImportsOf } from '../nativeModuleGuard'

const PICKER = '@react-native-community/datetimepicker'

/** ラッパー自身だけが datetimepicker を直接 import してよい。 */
const ALLOW = new Set(['ui/DateTimeSheet.tsx'])

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
 * ラチェット: 日付/時刻ピッカーの生成点を src/ui/DateTimeSheet.tsx に一本化する。
 *
 * `@react-native-community/datetimepicker` は **OSで描画のされ方が根本的に違う**（Android は
 * ネイティブダイアログ、iOS はビュー階層へインライン埋め込み）。素で書くと Android では
 * 正しく見えるのに iOS では日付チップが常駐し、自前の欄と合わせて二重表示になる。
 *
 * 実際 3箇所すべてが同じ書き方で、3箇所すべてが iOS で壊れていた（実機 206 で発覚）。
 * 型チェックもテストも通ってしまい、**片方のOSでしか再現しない**ので、面を足した人が
 * 気づける保証が無い。直接 import を禁じておけば、新しい日付入力を足しても漏れない。
 */
describe('日付ピッカー生成点のガード（ラチェット）', () => {
  it('DateTimeSheet 以外は datetimepicker を直接 import しない', () => {
    const srcDir = join(__dirname, '..')
    const offenders: string[] = []
    for (const file of listSources(srcDir)) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      if (ALLOW.has(rel)) continue
      if (findStaticImportsOf(readFileSync(file, 'utf8'), [PICKER]).length > 0) {
        offenders.push(rel)
      }
    }
    expect(offenders).toEqual([])
  })

  it('ラッパーは実際にその依存を使っている（ALLOW が形骸化していない）', () => {
    const wrapper = readFileSync(join(__dirname, 'DateTimeSheet.tsx'), 'utf8')
    expect(findStaticImportsOf(wrapper, [PICKER]).length).toBe(1)
  })
})
