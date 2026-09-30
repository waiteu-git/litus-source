import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 休講の編集画面の「自分で入力／候補から選ぶ」の配線ラチェット（設計 docs/design/2026-09-30-cancel-makeup-picker.md）。
 * 純関数のテストは画面が正しく呼んでいるかを保証しないので、ソースを読んで固定する（tsc も通ってしまう間違いを止める）。
 */

const ROOT = join(__dirname, '..', '..')
const src = () => readFileSync(join(ROOT, 'src/screens/ClassEventFormScreen.tsx'), 'utf8')

/** function 宣言の本体（波括弧の対応で閉じるまで）を切り出す。見つからなければ失敗（fail-open にしない）。 */
function body(s: string, anchor: string): string {
  const start = s.indexOf(anchor)
  expect(start, `開始アンカーが見つからない: ${anchor}`).toBeGreaterThan(-1)
  const open = s.indexOf(') {', start)
  expect(open, `本体の開始が見つからない: ${anchor}`).toBeGreaterThan(start)
  let depth = 0
  for (let i = open + 2; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  throw new Error(`本体の終わりが見つからない: ${anchor}`)
}

describe('純関数を画面が呼んでいる', () => {
  it('必要な関数を import している', () => {
    const s = src()
    expect(s).toMatch(/pickableMakeups/)
    for (const f of ['makeupFormValues', 'isMakeupPicked', 'initialMakeupMode', 'makeupSelectionError', 'shouldFocusMakeupCard']) {
      expect(s, f).toContain(f)
    }
    expect(s).toContain('makeupPickRowText')
    expect(s).toContain('makeupPickA11yLabel')
  })

  it('候補は全ての呼び出しで、ルート引数の科目名・コード（{ courseName, courseCode, date… }）と editId で作る（保存済みの e.courseName ではない）', () => {
    const s = src()
    // 読み込み時のモード決定（list）と、一覧用（events）の2か所。どちらも同じ規則で呼ぶ。
    const calls = [...s.matchAll(/pickableMakeups\(\s*(\w+),\s*\{([^}]*)\}\s*,\s*editId\s*\)/g)]
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const c of calls) {
      expect(c[2], c[0]).toMatch(/^\s*courseName,\s*courseCode,\s*date/)
      expect(c[2], c[0]).not.toMatch(/\.courseName|\.courseCode/)
    }
    expect(s.match(/pickableMakeups\(/g)?.length).toBe(calls.length) // 想定外の形の呼び出しが混ざっていない
    // ルート引数の courseName/courseCode は route.params の分割代入
    expect(s).toMatch(/const \{ courseName, courseCode,[^}]*\} = route\.params/)
  })

  it('選ぶ操作（pickMakeup）は makeupFormValues の値で4つの state を全部埋める', () => {
    const b = body(src(), 'function pickMakeup(')
    expect(b).toContain('makeupFormValues(')
    for (const setter of ['setMakeupStatus', 'setMkDate', 'setMkPeriods', 'setMkRoom']) expect(b, setter).toContain(setter)
    // 選択中の行をもう一度押しても何もしない
    expect(b).toMatch(/isMakeupPicked\(/)
  })

  it('選択中は isMakeupPicked で導出する（選択の状態を useState に持たない）', () => {
    const s = src()
    expect(s).not.toMatch(/useState[^\n]*[Pp]icked/)
    expect(s).not.toMatch(/const \[\s*picked\w*\s*,/)
    expect(s).toMatch(/isMakeupPicked\(\{ makeupStatus, mkDate, mkPeriods \}, \w+\)/)
  })

  it('保存の前に makeupSelectionError で未選択を止める（buildClassEventFromForm より前）', () => {
    const b = body(src(), 'async function onSave(')
    const at = b.indexOf('makeupSelectionError(')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(b.indexOf('buildClassEventFromForm('))
  })
})

describe('モード切替と入力欄', () => {
  it('モードは読み込み時に initialMakeupMode で1回だけ決め、以後はタップだけが変える', () => {
    const s = src()
    expect(s).toMatch(/useState<MakeupMode>\('manual'\)/)
    const setCalls = s.match(/setMkMode\(/g) ?? []
    // 読み込み時の1回（initialMakeupMode）＋切り替えのタップ
    expect(setCalls.length).toBeGreaterThanOrEqual(2)
    expect(s).toMatch(/setMkMode\(initialMakeupMode\(/)
    // 値から毎回導出してモードを決めない（入力中に値が候補と一致して入力欄が消える）
    expect(s).not.toMatch(/mkMode\s*=\s*initialMakeupMode\(/)
  })

  it('候補から選ぶモードでは補講日・時限・教室の入力欄を描画しない（三項の手入力側にだけ在る）', () => {
    const s = src()
    const pickBranch = s.indexOf("mkMode === 'pick' ? (")
    expect(pickBranch).toBeGreaterThan(-1)
    const dateSetter = s.indexOf("setPicker('mkDate')")
    expect(dateSetter).toBeGreaterThan(pickBranch)
    expect(s.match(/setPicker\('mkDate'\)/g)).toHaveLength(1)
    // 行リストは手入力欄より前（三項の pick 側）
    expect(s.indexOf('candidates.map(')).toBeGreaterThan(pickBranch)
    expect(s.indexOf('candidates.map(')).toBeLessThan(dateSetter)
  })

  it('モード切替の2択は、候補があって補講ありの時だけ出る', () => {
    const s = src()
    expect(s).toMatch(/candidates\.length > 0/)
    expect(s).toContain('自分で入力')
    expect(s).toContain('候補から選ぶ')
  })

  it('events は常に1回読む（editId が無くても）。編集値とモードは同じ .then で入れる', () => {
    const s = src()
    expect(s).not.toMatch(/if \(!editId\) return\s*\n\s*loadClassEvents\(\)/)
    expect(s).toMatch(/setEvents\(list\)/)
  })
})

describe('読み上げ・選択の表示', () => {
  it('候補の行・2択・補講あり/なし/未定の3チップに accessibilityRole="button" と accessibilityState の selected がある', () => {
    const s = src()
    // ループで描く要素はソースに1回しか出ないので、それぞれのアンカーの近くで確かめる
    const near = (anchor: string, span = 900) => {
      const at = s.indexOf(anchor)
      expect(at, `アンカーが見つからない: ${anchor}`).toBeGreaterThan(-1)
      return s.slice(at, at + span)
    }
    for (const anchor of ["'補講あり'", 'as MakeupMode[]', 'candidates.map(']) {
      const w = near(anchor)
      expect(w, anchor).toMatch(/accessibilityRole="button"/)
      expect(w, anchor).toMatch(/accessibilityState=\{\{ selected/)
    }
    expect(s).toMatch(/accessibilityLabel=\{makeupPickA11yLabel\(/)
  })

  it('選択中は色単独にしない（チェックアイコンと「選択中」の語）', () => {
    const s = src()
    expect(s).toContain('選択中')
    expect(s).toMatch(/checkmark/)
  })
})

describe('初回表示で補講欄へ寄せる', () => {
  it('shouldFocusMakeupCard の時だけ scrollTo し、animated: false（モーション規約に触れない）', () => {
    const s = src()
    expect(s).toContain('shouldFocusMakeupCard(')
    const at = s.indexOf('.scrollTo(')
    expect(at).toBeGreaterThan(-1)
    expect(s.slice(at, at + 80)).toMatch(/animated:\s*false/)
  })
})

describe('既存ラチェットを壊さない置き場', () => {
  it('onPicked と onSave の間に、フック・ハンドラを置かない（classEventForm.test.ts の切り出しを守る）', () => {
    const s = src()
    const a = s.indexOf('function onPicked(')
    const b = s.indexOf('async function onSave(')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    const between = s.slice(a, b)
    expect(between).not.toMatch(/useEffect\(|useMemo\(|useRef\(|useState\(/)
    expect(between.match(/function \w+\(/g) ?? []).toHaveLength(1) // onPicked 自身だけ
  })

  it('画面で ClassEvent リテラルを組まない（組み立ては classEventForm.ts）', () => {
    expect(src()).not.toMatch(/:\s*ClassEvent\s*=\s*\{/)
  })
})
