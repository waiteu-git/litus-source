import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { auditKeyboardEscape } from './keyboardEscapeGuard'

describe('auditKeyboardEscape', () => {
  const full = `
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <TextInput value={x} />
    </ScrollView>`

  it('TextInput を描画しない画面は対象外', () => {
    expect(auditKeyboardEscape('<View><Text>a</Text></View>')).toEqual({
      usesTextInput: false,
      missing: [],
    })
  })

  it('import しているだけでは対象にしない', () => {
    // 型 import（`type TextInput as RNTextInput`）で ref の型だけ借りる画面がある。
    const src = "import { TextInput } from '../ui/Text'\nconst a = 1\n"
    expect(auditKeyboardEscape(src).usesTextInput).toBe(false)
  })

  it('3点そろっていれば緑', () => {
    expect(auditKeyboardEscape(full).missing).toEqual([])
  })

  it('スクロールの器が無い画面を検出する（出席画面の実際の欠陥）', () => {
    const src = '<View><TextInput /><Pressable>送信</Pressable></View>'
    expect(auditKeyboardEscape(src).missing).toEqual([
      'scrollable',
      'keyboardShouldPersistTaps',
      'automaticallyAdjustKeyboardInsets',
    ])
  })

  it('FlatList / SectionList も器として認める', () => {
    for (const tag of ['FlatList', 'SectionList']) {
      const src = `<${tag} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets /><TextInput />`
      expect(auditKeyboardEscape(src).missing).toEqual([])
    }
  })

  it('似た名前のコンポーネントを誤検出しない', () => {
    // <TextInputRow ...> のような自前ラッパは別物として扱う（前方一致だと取り違える）。
    expect(auditKeyboardEscape('<TextInputRow />').usesTextInput).toBe(false)
    const noScroll = '<ScrollViewShim /><TextInput /> keyboardShouldPersistTaps automaticallyAdjustKeyboardInsets'
    expect(auditKeyboardEscape(noScroll).missing).toEqual(['scrollable'])
  })
})

function listTsx(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listTsx(p))
    else if (e.name.endsWith('.tsx')) out.push(p)
  }
  return out
}

/**
 * ラチェット: TextInput を描画する画面は、キーボード表示中でも操作対象へ到達できること。
 *
 * 免除する場合は ALLOW に**「なぜ詰まないか」を必ず書く**（`nativeModuleGuard` の ALLOW と同じ規約。
 * 理由の書けない免除は、9月公開後に誰も検証できない永久の負債になる）。
 */
const ALLOW: Record<string, string> = {}

/**
 * ⚠走査は `src/` 全体。**`src/screens/` だけを見ていた頃、入力欄を持つ Modal
 * （`src/report/DiagReportSheet.tsx`）は素通りしていた**＝入力は画面の外にも生える。
 * 詰み方は画面と同じ（むしろ Modal は Android で activity の adjustResize が効かないぶん重い）。
 */
const SRC_DIR = join(__dirname, '..')

describe('キーボード退避ガード（ラチェット）', () => {
  it('TextInput を描画するファイルはスクロール＋キーボード退避を持つ', () => {
    if (!existsSync(SRC_DIR)) return
    const offenders: string[] = []
    for (const file of listTsx(SRC_DIR)) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      if (rel in ALLOW) continue
      const r = auditKeyboardEscape(readFileSync(file, 'utf8'))
      if (r.missing.length > 0) offenders.push(`${rel}: ${r.missing.join(',')}`)
    }
    expect(offenders).toEqual([])
  })

  /**
   * ガードが**実際にファイルを見ている**ことを確かめる。走査対象が空・パスずれで
   * 「offenders が常に空」になると、ラチェットは緑のまま何も守らない
   * （生色ガードが `src/ui/` を見ていなかったのと同じ失敗の形）。
   * **`src/screens/` の外も見ていること**まで固定する＝走査範囲が縮んだら気づける。
   */
  it('走査対象に TextInput のファイルが実在する（空振りラチェット防止）', () => {
    const withInput = listTsx(SRC_DIR).filter(
      (f) => auditKeyboardEscape(readFileSync(f, 'utf8')).usesTextInput,
    )
    expect(withInput.length).toBeGreaterThanOrEqual(5)
    expect(withInput.some((f) => f.endsWith('AttendanceScreen.tsx'))).toBe(true)
    expect(withInput.some((f) => !f.replace(/\\/g, '/').includes('/src/screens/'))).toBe(true)
  })
})
