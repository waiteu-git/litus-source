import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 休講の編集画面の「自分で入力／候補から選ぶ」の配線ラチェット（設計 docs/design/2026-09-30-cancel-makeup-picker.md）。
 * 純関数のテストは画面が正しく呼んでいるかを保証しないので、ソースを読んで固定する（tsc も通ってしまう間違いを止める）。
 * 文字列の有無だけでなく、**領域を切り出して**「そこにあるべきもの／あってはならないもの」を検査する
 * （2026-09-30 の独立レビューで、有無だけの検査は入力欄の描画やガードの脱落をすり抜けると分かった）。
 */

const ROOT = join(__dirname, '..', '..')
const src = () => readFileSync(join(ROOT, 'src/screens/ClassEventFormScreen.tsx'), 'utf8')

/** s[openIdx]（'(' か '{'）に対応する閉じ括弧の位置。ネスト対応・見つからなければ失敗（fail-open にしない）。 */
function matching(s: string, openIdx: number): number {
  const open = s[openIdx]
  const close = open === '(' ? ')' : '}'
  expect(['(', '{'], `括弧でない: ${JSON.stringify(open)}`).toContain(open)
  let depth = 0
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === open) depth++
    else if (s[i] === close) {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(`対応する閉じ括弧が見つからない: ${s.slice(openIdx, openIdx + 40)}`)
}

/** function 宣言の本体（波括弧の対応で閉じるまで）。 */
function body(s: string, anchor: string): string {
  const start = s.indexOf(anchor)
  expect(start, `開始アンカーが見つからない: ${anchor}`).toBeGreaterThan(-1)
  const open = s.indexOf(') {', start)
  expect(open, `本体の開始が見つからない: ${anchor}`).toBeGreaterThan(start)
  return s.slice(start, matching(s, open + 2) + 1)
}

/** `anchor(` で始まる呼び出しの全体（括弧の対応まで）を全て返す。 */
function calls(s: string, anchor: string): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const at = s.indexOf(`${anchor}(`, from)
    if (at === -1) return out
    const open = at + anchor.length
    out.push(s.slice(at, matching(s, open) + 1))
    from = open + 1
  }
}

/** 補講の読み込み effect（loadClassEvents() で始まる useEffect）の全体。 */
function loadEffect(s: string): string {
  const at = s.search(/useEffect\(\(\) => \{\s*\n\s*loadClassEvents\(\)/)
  expect(at, '読み込み effect（loadClassEvents() で始まる useEffect）が見つからない').toBeGreaterThan(-1)
  return s.slice(at, matching(s, s.indexOf('(', at)) + 1)
}

/** `{... mkMode === 'pick' ? ( 選ぶ側 ) : ( 手入力側 )}` を、選ぶ側と手入力側に分ける。 */
function branches(s: string): { pick: string; manual: string } {
  const marker = "mkMode === 'pick' ? ("
  const at = s.indexOf(marker)
  expect(at, "三項 mkMode === 'pick' ? ( が見つからない").toBeGreaterThan(-1)
  const pickOpen = at + marker.length - 1
  const pickEnd = matching(s, pickOpen)
  const rest = s.slice(pickEnd + 1)
  expect(rest, '選ぶ側の直後は ") : (" で手入力側が続く').toMatch(/^\s*:\s*\(/)
  const elseOpen = pickEnd + 1 + rest.indexOf('(')
  return { pick: s.slice(pickOpen, pickEnd + 1), manual: s.slice(elseOpen, matching(s, elseOpen) + 1) }
}

describe('純関数を画面が呼んでいる', () => {
  it('必要な関数を import している', () => {
    const s = src()
    for (const f of [
      'pickableMakeups', 'makeupFormValues', 'isMakeupPicked', 'initialMakeupMode', 'makeupSelectionError',
      'shouldFocusMakeupCard', 'makeupPickRowText', 'makeupPickA11yLabel',
    ]) {
      expect(s, f).toContain(f)
    }
  })

  it('候補は全ての呼び出しで、ルート引数の科目名・コードと editId で作る（保存済みの e.courseName・e.courseCode を使わない）', () => {
    const s = src()
    const cs = calls(s, 'pickableMakeups')
    expect(cs.length).toBeGreaterThanOrEqual(2) // 読み込み時のモード決定と、一覧用
    for (const c of cs) {
      expect(c, c).toMatch(/courseName/)
      expect(c, c).toMatch(/courseCode/)
      expect(c, c).toMatch(/editId/)
      expect(c, c).not.toMatch(/\.courseName|\.courseCode/)
    }
    expect(s.match(/pickableMakeups\(/g)?.length).toBe(cs.length)
    expect(s).toMatch(/const \{ courseName, courseCode,[^}]*\} = route\.params/)
  })

  it('選ぶ操作（pickMakeup）は makeupFormValues の4つの値をそれぞれの setter へ渡し、選択中の再タップは何もしない', () => {
    const b = body(src(), 'function pickMakeup(')
    expect(b).toContain('makeupFormValues(s)')
    expect(b).toContain('setMakeupStatus(v.makeupStatus)')
    expect(b).toContain('setMkDate(v.mkDate)')
    expect(b).toContain('setMkPeriods(v.mkPeriods)')
    expect(b).toContain('setMkRoom(v.mkRoom)')
    // 再タップの早期 return は否定でない形（反転すると未選択の行が押せなくなる）
    expect(b).toMatch(/if \(isMakeupPicked\(\{ makeupStatus, mkDate, mkPeriods, mkRoom \}, s\)\) return/)
    expect(b).not.toMatch(/!\s*isMakeupPicked/)
  })

  it('選択中は isMakeupPicked で導出する（選択の状態を useState に持たない）', () => {
    const s = src()
    expect(s).not.toMatch(/useState[^\n]*[Pp]icked/)
    expect(s).not.toMatch(/const \[\s*picked\w*\s*,/)
    const at = s.indexOf('candidates.map(')
    expect(at).toBeGreaterThan(-1)
    expect(s.slice(at, at + 200)).toMatch(/const on = isMakeupPicked\(\{ makeupStatus, mkDate, mkPeriods, mkRoom \}, c\)/)
  })

  it('保存の前に makeupSelectionError で未選択を止める（手入力の補講の検査・buildClassEventFromForm より前）', () => {
    const b = body(src(), 'async function onSave(')
    const at = b.indexOf('makeupSelectionError(')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(b.indexOf("setError('補講の日付と時限を入力してください')"))
    expect(at).toBeLessThan(b.indexOf('buildClassEventFromForm('))
  })
})

describe('モード切替と入力欄', () => {
  it('モードは読み込み時に initialMakeupMode で1回だけ決め、以後はタップだけが変える', () => {
    const s = src()
    expect(s).toMatch(/useState<MakeupMode>\('manual'\)/)
    expect(loadEffect(s)).toContain('setMkMode(initialMakeupMode(')
    expect((s.match(/setMkMode\(/g) ?? []).length).toBeGreaterThanOrEqual(2) // 読み込み時＋切り替えのタップ
    // 値から毎回導出してモードを決めない（入力中に値が候補と一致して入力欄が消える）
    expect(s).not.toMatch(/mkMode\s*=\s*initialMakeupMode\(/)
  })

  it('events は常に1回読む（editId が無くても）。失敗は握って手入力のまま・読み込み完了まで補講欄を描かない', () => {
    const s = src()
    const e = loadEffect(s)
    expect(e).not.toMatch(/if \(!editId\) return/)
    expect(e).toContain('setEvents(list)')
    expect(e).toContain('.catch(')
    expect(e).toContain('setEventsLoaded(true)')
    expect(s).toMatch(/eventsLoaded && makeupStatus === 'has'/)
  })

  it('候補から選ぶモードでは、補講日・時限・教室の入力欄を描画しない（入力欄は手入力側にだけある）', () => {
    const { pick, manual } = branches(src())
    for (const forbidden of ['DateField', 'DateTimeSheet', 'PeriodChips', 'TextInput', 'setMkRoom', 'setMkPeriods', 'setMkDate', 'setPicker']) {
      expect(pick, `選ぶ側に ${forbidden} があってはならない`).not.toContain(forbidden)
    }
    for (const required of ['DateField', 'DateTimeSheet', 'PeriodChips', 'TextInput', 'setMkRoom', 'setMkPeriods', "setPicker('mkDate')"]) {
      expect(manual, `手入力側に ${required} がある`).toContain(required)
    }
    // 行リストは選ぶ側にある
    expect(pick).toContain('candidates.map(')
    expect(manual).not.toContain('candidates.map(')
  })

  it('モード切替の2択は、補講ありで候補が1件以上ある時だけ出る（補講あり側の中・候補あり条件の直後）', () => {
    const s = src()
    const choice = s.indexOf('as MakeupMode[]')
    expect(choice).toBeGreaterThan(-1)
    expect(s.slice(Math.max(0, choice - 160), choice)).toMatch(/candidates\.length > 0 \? \(/)
    const hasBlock = s.indexOf("eventsLoaded && makeupStatus === 'has'")
    expect(hasBlock).toBeGreaterThan(-1)
    expect(choice).toBeGreaterThan(hasBlock)
  })

  it('補講あり以外で候補がある時は、候補の件数と「補講あり」で選べることを1行で示す', () => {
    expect(src()).toMatch(/candidates\.length > 0 && makeupStatus !== 'has'/)
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

  it('選択中は色単独にしない（チェックアイコンと「選択中」の語が同じ表示ブロックにある）', () => {
    expect(src()).toMatch(/checkmark-circle[\s\S]{0,200}<Text[^>]*>選択中<\/Text>/)
  })

  it('補足の確定ボタン名は、ボタン自身の文言（保存／追加）と同じ出し分け', () => {
    const s = src()
    expect((s.match(/\{editId \? '保存' : '追加'\}/g) ?? []).length).toBeGreaterThanOrEqual(2) // ボタンと補足
  })
})

describe('補講欄へ寄せる（初回だけ）', () => {
  it('読み込み effect の中で1回だけ判定し、scrollTo は animated: false。あとから再評価する別の effect を作らない', () => {
    const s = src()
    expect(s.match(/shouldFocusMakeupCard\(/g)?.length).toBe(1)
    expect(loadEffect(s)).toContain('shouldFocusMakeupCard(')
    const scrolls = calls(s, 'scrollRef.current?.scrollTo')
    expect(scrolls).toHaveLength(1)
    expect(scrolls[0]).toMatch(/animated:\s*false/)
    expect(s).not.toMatch(/useEffect\(\s*tryFocus/)
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
