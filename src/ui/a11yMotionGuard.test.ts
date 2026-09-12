import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  codeHas,
  codeLines,
  codeRefers,
  countCalls,
  findForbiddenA11y,
  hasFixedSyncLabel,
  hasFlagLabel,
  hasUnsourcedFifteen,
  isCommentLine,
  motionWiringViolation,
  passesSelectedState,
  sliceFrom,
} from './a11yMotionGuard'

const SRC = join(__dirname, '..')

/** src の .ts/.tsx。*.test.ts(x) は除く（陰性の対照の合成文字列を持つテスト自身を数えない）。 */
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
const FILES = listSources(SRC)
const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/')
const read = (r: string) => readFileSync(join(SRC, r), 'utf8')

describe('a11yMotionGuard 判定部（合成文字列の陽性・陰性の対照）', () => {
  it('コメント行の判定（//・/*・* で始まる行）', () => {
    expect(isCommentLine('// x')).toBe(true)
    expect(isCommentLine('  /** 3速の spatial spring。 */')).toBe(true)
    expect(isCommentLine('   * ── Reduce Motion')).toBe(true)
    expect(isCommentLine('const a = 1 // x')).toBe(false)
    expect(codeLines('a\n// b\nc')).toEqual(['a', 'c'])
  })
  it('R1 型: Animated.loop( だけの合成文字列は違反／shouldAnimateAmbient を参照していれば違反でない', () => {
    const bare = 'const loop = Animated.loop(Animated.timing(x, cfg))'
    expect(motionWiringViolation(bare, ['Animated.loop('], 'shouldAnimateAmbient')).toBe(true)
    const wired = "import { shouldAnimateAmbient } from './reducedMotion'\n" + bare
    expect(motionWiringViolation(wired, ['Animated.loop('], 'shouldAnimateAmbient')).toBe(false)
  })
  it('R2 型: spring.ts:21 と同じ形のコメント行だけの合成文字列は違反にならない', () => {
    const doc = '/** 3速の spatial spring。Animated.spring({ stiffness, damping, mass, useNativeDriver:true }) に渡す。 */'
    expect(motionWiringViolation(doc, ['Animated.spring(', 'LayoutAnimation.configureNext('], 'useReducedMotion')).toBe(false)
  })
  it('R2 型: コード行の Animated.spring(／LayoutAnimation.configureNext( は、参照がコメントにしか無ければ違反', () => {
    expect(motionWiringViolation('Animated.spring(t.tx, SPRING_BACK).start()', ['Animated.spring('], 'useReducedMotion')).toBe(true)
    expect(
      motionWiringViolation(
        '// useReducedMotion を使う\nLayoutAnimation.configureNext(HEIGHT_ANIM)',
        ['LayoutAnimation.configureNext('],
        'useReducedMotion',
      ),
    ).toBe(true)
  })
  it('R3 型: reducedShift を消した合成文字列は参照なし／語境界で数える', () => {
    expect(codeRefers("swipeShift.setValue(dir === 'next' ? SHIFT.medium : -SHIFT.medium)", 'reducedShift')).toBe(false)
    expect(codeRefers('swipeShift.setValue(reducedShift(rm, SHIFT.medium))', 'reducedShift')).toBe(true)
    expect(codeRefers('const myreducedShiftX = 1', 'reducedShift')).toBe(false)
  })
  it('R4: role="tab"・accessibilityRole="tab"・開閉状態の直書き（1行／複数行）・aria-expanded を見つける', () => {
    expect(findForbiddenA11y('<Pressable role="tab" />')).toEqual(['role="tab"'])
    expect(findForbiddenA11y('<Pressable accessibilityRole="tab" />')).toEqual(['accessibilityRole="tab"'])
    expect(findForbiddenA11y('<Pressable accessibilityState={{ expanded: open }} />')).toHaveLength(1)
    expect(findForbiddenA11y('<Pressable\n  accessibilityState={{\n    expanded: open,\n  }}\n/>')).toHaveLength(1)
    expect(findForbiddenA11y('<Pressable aria-expanded={open} />')).toHaveLength(1)
  })
  it('R4 陰性: selected・disclosureA11yProps の展開・素の expanded:（pdfViewerHtml.ts の形）・コメントは違反でない', () => {
    expect(findForbiddenA11y('<Pressable accessibilityRole="button" accessibilityState={{ selected: on }} />')).toEqual([])
    expect(findForbiddenA11y('<Pressable {...disclosureA11yProps(open, toggle)} />')).toEqual([])
    expect(findForbiddenA11y("const cfg = { expanded: true, sidebar: 'none' }")).toEqual([])
    expect(findForbiddenA11y('// accessibilityRole="tab" は使わない')).toEqual([])
  })
  it('R4: 選択状態を渡しているか・呼び出しの数・関数の切り出し', () => {
    expect(passesSelectedState('accessibilityState={{ selected: on }}')).toBe(true)
    expect(passesSelectedState('accessibilityRole="button"')).toBe(false)
    expect(
      countCalls(
        '{...disclosureA11yProps(open, a)}\n{...disclosureA11yProps(open, b)}\n// disclosureA11yProps(x)',
        'disclosureA11yProps(',
      ),
    ).toBe(2)
    expect(sliceFrom('export function A() {}\nexport function B() {}', 'export function A')).toBe('export function A() {}')
    expect(sliceFrom('x', 'export function A')).toBe('')
  })
  it('R5: 固定ラベルの合成文字列は違反／ラベルを消したフラグの合成文字列は違反', () => {
    expect(hasFixedSyncLabel('<PressableRow accessibilityLabel="同期">')).toBe(true)
    expect(hasFixedSyncLabel('<PressableRow accessibilityLabel={syncChipA11yLabel(input, now)}>')).toBe(false)
    expect(hasFlagLabel("<Pressable accessibilityLabel={item.flagged ? 'フラグを外す' : 'フラグを付ける'}>")).toBe(true)
    expect(hasFlagLabel('<Pressable onPress={toggleFlag} disabled={flagBusy || fetching}>')).toBe(false)
  })
  it('R6: 出典の無い数値（半角・全角）を含む合成文字列は違反／似た別の数は拾わない', () => {
    expect(hasUnsourcedFifteen('/** OSのReduce Motion設定を購読するフック。約15%のユーザーが有効化。 */')).toBe(true)
    expect(hasUnsourcedFifteen('約15％')).toBe(true)
    expect(hasUnsourcedFifteen('約150ms')).toBe(false)
    expect(hasUnsourcedFifteen('15%')).toBe(false)
  })
})

describe('E0 ラチェット（src を走査）: 前提と今から緑のもの', () => {
  it('走査対象が空でなく、テスト自身を含まない（ガードの前提）', () => {
    expect(FILES.length).toBeGreaterThan(50)
    expect(FILES.map(rel)).toContain('ui/Pressable.tsx')
    expect(FILES.map(rel).some((r) => /\.test\.tsx?$/.test(r))).toBe(false)
  })
  it('陽性の対照: 既に配線済みの Pressable.tsx は R2 型の判定を通る', () => {
    const src = read('ui/Pressable.tsx')
    // 判定の対象が実物に在ること（無ければ下の false は空振りで通ってしまう）
    expect(codeHas(src, 'Animated.timing(')).toBe(true)
    expect(codeRefers(src, 'useReducedMotion')).toBe(true)
    expect(motionWiringViolation(src, ['Animated.timing('], 'useReducedMotion')).toBe(false)
    // 陰性の対照: 同じ実物から useReducedMotion の参照を消すと違反になる（判定が実物の上でも効いている）
    expect(motionWiringViolation(src.replace(/useReducedMotion/g, 'useX'), ['Animated.timing('], 'useReducedMotion')).toBe(true)
  })
  it('R4: src の .tsx に tab の役割・開閉状態の直書き・aria-expanded が無い', () => {
    const offenders = FILES.filter((f) => f.endsWith('.tsx'))
      .filter((f) => findForbiddenA11y(readFileSync(f, 'utf8')).length > 0)
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('E0 ラチェット R6（C1＝出典の無い数値をコードから消す）', () => {
  it('src（テスト以外）に出典の無い数値が無い', () => {
    const offenders = FILES.filter((f) => hasUnsourcedFifteen(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })
})

describe('E0 ラチェット R1（ambient ループは shouldAnimateAmbient を通す）', () => {
  it('Animated.loop( を書くファイルは shouldAnimateAmbient を参照している', () => {
    const offenders = FILES.filter((f) =>
      motionWiringViolation(readFileSync(f, 'utf8'), ['Animated.loop('], 'shouldAnimateAmbient'),
    ).map(rel)
    expect(offenders).toEqual([])
  })
  it('対象が実在する（形骸化の防止）: NowPulse.tsx と screen.tsx が Animated.loop( を書いている', () => {
    expect(codeHas(read('ui/NowPulse.tsx'), 'Animated.loop(')).toBe(true)
    expect(codeHas(read('ui/screen.tsx'), 'Animated.loop(')).toBe(true)
  })
})

describe('E0 ラチェット R4（選択状態）', () => {
  it('Segmented は各項目に選択状態（selected）を accessibilityState で渡している', () => {
    const body = sliceFrom(read('ui/screen.tsx'), 'export function Segmented')
    expect(body).not.toBe('')
    expect(passesSelectedState(body)).toBe(true)
  })
})

describe('E0 ラチェット R3（変位は reducedShift を通す）: ui/screen.tsx', () => {
  it('カルーセルのドリフトは reducedShift を通す（M4）', () => {
    expect(codeRefers(read('ui/screen.tsx'), 'reducedShift')).toBe(true)
  })
})

describe('E0 ラチェット R4（開閉は disclosureA11yProps を通す）', () => {
  it('Accordion の見出しは disclosureA11yProps を通している', () => {
    expect(countCalls(read('ui/Accordion.tsx'), 'disclosureA11yProps(')).toBeGreaterThanOrEqual(1)
  })
  it('課題の「期限切れ」「非表示」の見出し（2箇所）は disclosureA11yProps を通している', () => {
    expect(countCalls(read('screens/AssignmentsScreen.tsx'), 'disclosureA11yProps(')).toBeGreaterThanOrEqual(2)
  })
})

describe('E0 ラチェット R2（バネと高さのアニメは useReducedMotion を通す）', () => {
  it('Animated.spring( と LayoutAnimation.configureNext( を書くファイルは useReducedMotion を参照している（コメント行は数えない）', () => {
    const offenders = FILES.filter((f) =>
      motionWiringViolation(
        readFileSync(f, 'utf8'),
        ['Animated.spring(', 'LayoutAnimation.configureNext('],
        'useReducedMotion',
      ),
    ).map(rel)
    expect(offenders).toEqual([])
  })
  it('対象が実在する（形骸化の防止）: SwipeToHide.tsx が Animated.spring(、Accordion.tsx が LayoutAnimation.configureNext( を書いている', () => {
    expect(codeHas(read('ui/SwipeToHide.tsx'), 'Animated.spring(')).toBe(true)
    expect(codeHas(read('ui/Accordion.tsx'), 'LayoutAnimation.configureNext(')).toBe(true)
  })
  it('spring.ts:21 の説明コメントにある Animated.spring( は数えない（数えると誤ブロック）', () => {
    expect(motionWiringViolation(read('ui/spring.ts'), ['Animated.spring('], 'useReducedMotion')).toBe(false)
  })
})

describe('E0 ラチェット R3（変位は reducedShift を通す）: screens/TimetableScreen.tsx', () => {
  it('曜日スワイプの変位は reducedShift を通す（M10）', () => {
    expect(codeRefers(read('screens/TimetableScreen.tsx'), 'reducedShift')).toBe(true)
  })
})

describe('E0 ラチェット R3（変位は reducedShift を通す）: screens/HomeScreen.tsx', () => {
  it('出席バナーの降下は reducedShift を通す（M5）', () => {
    expect(codeRefers(read('screens/HomeScreen.tsx'), 'reducedShift')).toBe(true)
  })
})

describe('E0 ラチェット R5（名前を落とさない）: 同期チップ', () => {
  it('HomeSyncButton.tsx に固定のラベル accessibilityLabel="同期" が無い（状態が読まれなくなる）', () => {
    expect(hasFixedSyncLabel(read('home/HomeSyncButton.tsx'))).toBe(false)
  })
  it('HomeSyncButton.tsx は syncChipA11yLabel で名前を作っている', () => {
    expect(codeHas(read('home/HomeSyncButton.tsx'), 'accessibilityLabel={syncChipA11yLabel(')).toBe(true)
  })
})

describe('E0 ラチェット R5（名前を落とさない）: 掲示詳細のフラグ', () => {
  it('BulletinDetailScreen.tsx のフラグに両状態の accessibilityLabel がある（B の作り直しで落とさない）', () => {
    expect(hasFlagLabel(read('screens/BulletinDetailScreen.tsx'))).toBe(true)
  })
})
