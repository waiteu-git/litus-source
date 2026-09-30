import { describe, expect, it } from 'vitest'
import {
  coveredStandaloneMakeups,
  pickableMakeups,
  type ClassEvent,
} from './classEvent'
import {
  buildClassEventFromForm,
  EMPTY_COUNTDOWN_FORM,
  initialMakeupMode,
  isMakeupPicked,
  makeupFormValues,
  makeupSelectionError,
  shouldFocusMakeupCard,
  type ClassEventFormInput,
} from './classEventForm'
import { makeupPickA11yLabel, makeupPickRowText, shortDateWithWeekday } from './eventLabels'

/**
 * 休講の編集画面で「追加済みの補講から選ぶ」ための純関数（設計 docs/design/2026-09-30-cancel-makeup-picker.md）。
 * 選ぶ＝補講の日付・時限・教室を休講の補講欄へ写す。保存後は前回実装した畳み（carriesMakeup）が単独補講を覆う。
 */

const standalone = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 's1', courseName: '図学・製図', courseCode: '9973415', type: 'makeup', date: '2026-09-23', periods: [3],
  room: '野：1211教室', note: null, createdAt: 't', ...o,
})
const carrier = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 'c1', courseName: '図学・製図', courseCode: '9973415', type: 'cancel', date: '2026-10-21', periods: [3],
  room: null, note: null, createdAt: 't', makeupStatus: 'has',
  makeup: { date: '2026-09-23', periods: [3], room: '野：1211教室' }, ...o,
})
const cancel = { courseName: '図学・製図', courseCode: '9973415', date: '2026-10-21' }
const ids = (l: ClassEvent[]) => l.map((e) => e.id)

describe('pickableMakeups: 休講に選べる単独補講', () => {
  it('同一授業の単独補講だけ（コード優先・無ければ空白除去の名称）', () => {
    const events = [
      standalone({ id: 'a' }),
      standalone({ id: 'b', courseCode: '1111111' }), // コードが両方あって違う＝別授業
      standalone({ id: 'c', courseCode: null, courseName: '図学　・ 製図' }), // 名称ゆれ（空白）
      standalone({ id: 'd', courseCode: null, courseName: '線形代数学１' }), // 別授業
    ]
    expect(ids(pickableMakeups(events, cancel)).sort()).toEqual(['a', 'c'])
    // 休講側のコードが空なら名称で比べる（sameCourse の既存の規則）＝コードが違っても同名の b も入る
    expect(ids(pickableMakeups(events, { ...cancel, courseCode: null })).sort()).toEqual(['a', 'b', 'c'])
    expect(ids(pickableMakeups(events, { ...cancel, courseCode: '' })).sort()).toEqual(['a', 'b', 'c'])
  })

  it('単独補講以外の種別は出さない', () => {
    const events = [carrier(), standalone({ id: 'r', type: 'roomChange' }), standalone({ id: 'q', type: 'quiz' })]
    expect(pickableMakeups(events, cancel)).toEqual([])
  })

  it('他の休講に既に覆われた補講は出さない（同じ補講を2つの休講に選べない）', () => {
    const events = [carrier({ id: 'c-other', date: '2026-11-04' }), standalone()]
    expect(pickableMakeups(events, cancel)).toEqual([])
  })

  it('編集中の休講が覆っている補講は残す（選択中として出す）', () => {
    const events = [carrier({ id: 'c1' }), standalone()]
    expect(ids(pickableMakeups(events, cancel, 'c1'))).toEqual(['s1'])
    // 編集でない（新規）なら、覆われているので出ない
    expect(pickableMakeups(events, cancel)).toEqual([])
  })

  it('編集中の予定自身は候補に出ない（補講の編集中に種類を休講へ変えても、自分は選択肢に出ない）', () => {
    expect(pickableMakeups([standalone({ id: 'me' })], cancel, 'me')).toEqual([])
  })

  it('日付が不正・時限が空・1〜6限の外を含む補講は出さない（フォームの時限チップは1〜6のみ）', () => {
    const events = [
      standalone({ id: 'ok' }),
      standalone({ id: 'bad-date', date: '2026-02-31' }),
      standalone({ id: 'no-period', periods: [] }),
      standalone({ id: 'p7', periods: [7] }),
      standalone({ id: 'p0', periods: [0, 3] }),
    ]
    expect(ids(pickableMakeups(events, cancel))).toEqual(['ok'])
  })

  it('補講が休講より前でも出る（実データは補講 9/23 が休講 10/21 より前）', () => {
    expect(ids(pickableMakeups([standalone({ date: '2026-09-23' })], { ...cancel, date: '2026-10-21' }))).toEqual(['s1'])
    expect(ids(pickableMakeups([standalone({ date: '2026-11-11' })], { ...cancel, date: '2026-10-21' }))).toEqual(['s1'])
  })

  it('休講日に近い順（同じ差なら日付順）。休講日が空・不正なら日付順', () => {
    const events = [
      standalone({ id: 'far', date: '2026-12-01' }),
      standalone({ id: 'near-after', date: '2026-10-28' }),
      standalone({ id: 'near-before', date: '2026-10-14' }), // 差は near-after と同じ7日 → 日付が早い方が先
      standalone({ id: 'mid', date: '2026-10-22' }),
    ]
    expect(ids(pickableMakeups(events, cancel))).toEqual(['mid', 'near-before', 'near-after', 'far'])
    expect(ids(pickableMakeups(events, { ...cancel, date: '' }))).toEqual(['near-before', 'mid', 'near-after', 'far'])
    expect(ids(pickableMakeups(events, { ...cancel, date: '2026-13-40' }))).toEqual(['near-before', 'mid', 'near-after', 'far'])
  })

  it('入力の並びを変えない（元の配列を破壊しない）・0件は空', () => {
    const events = [standalone({ id: 'b', date: '2026-12-01' }), standalone({ id: 'a', date: '2026-10-22' })]
    const before = [...events]
    pickableMakeups(events, cancel)
    expect(events).toEqual(before)
    expect(pickableMakeups([], cancel)).toEqual([])
  })

  it('既存データの限界（記録）: 同じ補講を持つ休講が2件あると、どちらの編集画面にも候補が出ない', () => {
    const events = [carrier({ id: 'cA' }), carrier({ id: 'cB', date: '2026-11-04' }), standalone()]
    expect(pickableMakeups(events, cancel, 'cA')).toEqual([])
    expect(pickableMakeups(events, cancel, 'cB')).toEqual([])
  })
})

describe('makeupFormValues / isMakeupPicked', () => {
  it('選んだ補講の日付・時限・教室をそのまま写す（教室は null なら空文字）', () => {
    expect(makeupFormValues(standalone())).toEqual({
      makeupStatus: 'has', mkDate: '2026-09-23', mkPeriods: [3], mkRoom: '野：1211教室',
    })
    expect(makeupFormValues(standalone({ room: null })).mkRoom).toBe('')
    expect(makeupFormValues(standalone({ periods: [4, 3] })).mkPeriods).toEqual([4, 3])
  })

  it('写した配列は元の補講の配列と別物（フォーム側の編集で元を壊さない）', () => {
    const s = standalone({ periods: [3, 4] })
    const v = makeupFormValues(s)
    v.mkPeriods.push(5)
    expect(s.periods).toEqual([3, 4])
  })

  it('選択中は値から導出する: 補講あり・日付一致・コマ集合一致（順序は問わない）・教室一致', () => {
    const s = standalone({ periods: [3, 4] })
    const f = { makeupStatus: 'has' as const, mkDate: '2026-09-23', mkPeriods: [4, 3], mkRoom: '野：1211教室' }
    expect(isMakeupPicked(f, s)).toBe(true)
    expect(isMakeupPicked({ ...f, mkDate: '2026-09-24' }, s)).toBe(false)
    expect(isMakeupPicked({ ...f, mkPeriods: [3] }, s)).toBe(false)
    expect(isMakeupPicked({ ...f, makeupStatus: 'undecided' }, s)).toBe(false)
    expect(isMakeupPicked({ ...f, makeupStatus: 'none' }, s)).toBe(false)
  })

  it('教室が違えば選択中でない（手入力の教室が候補と違うのに、選んだように見えて食い違うのを防ぐ）。前後の空白と null≒空は同じ', () => {
    const s = standalone({ periods: [3] })
    const f = { makeupStatus: 'has' as const, mkDate: '2026-09-23', mkPeriods: [3], mkRoom: '野：1211教室' }
    expect(isMakeupPicked({ ...f, mkRoom: 'K404' }, s)).toBe(false)
    expect(isMakeupPicked({ ...f, mkRoom: '' }, s)).toBe(false)
    expect(isMakeupPicked({ ...f, mkRoom: ' 野：1211教室 ' }, s)).toBe(true)
    const noRoom = standalone({ room: null })
    expect(isMakeupPicked({ ...f, mkRoom: '' }, noRoom)).toBe(true)
    expect(isMakeupPicked({ ...f, mkRoom: '   ' }, noRoom)).toBe(true)
    expect(isMakeupPicked({ ...f, mkRoom: 'K404' }, noRoom)).toBe(false)
  })

  it('選んだ値は、その補講が選択中になる（写し→導出の往復）', () => {
    const s = standalone({ periods: [2, 3] })
    expect(isMakeupPicked(makeupFormValues(s), s)).toBe(true)
  })
})

describe('initialMakeupMode: 開いた時の補講欄のモード', () => {
  const cands = [standalone()]
  const empty = { makeupStatus: 'undecided' as const, mkDate: '', mkPeriods: [] as number[], mkRoom: '' }

  it('候補が0件なら手入力（今と同じ画面）', () => {
    expect(initialMakeupMode([], empty)).toBe('manual')
    expect(initialMakeupMode([], makeupFormValues(standalone()))).toBe('manual')
  })

  it('候補があり、補講の日程が未入力なら候補から選ぶ（未定・なし・あり(空)のいずれも）', () => {
    expect(initialMakeupMode(cands, empty)).toBe('pick')
    expect(initialMakeupMode(cands, { ...empty, makeupStatus: 'none' })).toBe('pick')
    expect(initialMakeupMode(cands, { ...empty, makeupStatus: 'has' })).toBe('pick')
  })

  it('保存済みの補講が候補のどれかと一致していれば候補から選ぶ（選択中・変更不可で開く）', () => {
    expect(initialMakeupMode(cands, makeupFormValues(standalone()))).toBe('pick')
  })

  it('手入力の日程が入っていて、どの候補にも当たらなければ手入力を尊重する', () => {
    expect(initialMakeupMode(cands, { makeupStatus: 'has', mkDate: '2026-09-30', mkPeriods: [4], mkRoom: '' })).toBe('manual')
    // 日付だけ・時限だけ入っている途中の手入力も尊重
    expect(initialMakeupMode(cands, { makeupStatus: 'has', mkDate: '2026-09-30', mkPeriods: [], mkRoom: '' })).toBe('manual')
    expect(initialMakeupMode(cands, { makeupStatus: 'has', mkDate: '', mkPeriods: [3], mkRoom: '' })).toBe('manual')
  })

  it('日付・時限が候補と一致しても教室が違う手入力は、手入力のまま開く（選んだように見えて食い違うのを防ぐ）', () => {
    // 実データ: 休講＆補講の掲示で保存した休講は教室が「1211教室」、単独補講は「野：1211教室」
    const saved = { makeupStatus: 'has' as const, mkDate: '2026-09-23', mkPeriods: [3], mkRoom: '1211教室' }
    expect(initialMakeupMode(cands, saved)).toBe('manual')
    expect(initialMakeupMode(cands, { ...saved, mkRoom: '野：1211教室' })).toBe('pick')
  })

  it('補講あり以外なら、日程の値が残っていても候補から選ぶ（補講なし・未定の値は保存されない）', () => {
    expect(initialMakeupMode(cands, { makeupStatus: 'none', mkDate: '2026-09-30', mkPeriods: [4], mkRoom: '' })).toBe('pick')
    expect(initialMakeupMode(cands, { makeupStatus: 'undecided', mkDate: '2026-09-30', mkPeriods: [], mkRoom: '' })).toBe('pick')
  })
})

describe('makeupSelectionError: 候補から選ぶモードの未選択', () => {
  const cands = [standalone()]
  const has = (mkDate: string, mkPeriods: number[], mkRoom = '') => ({ makeupStatus: 'has' as const, mkDate, mkPeriods, mkRoom })

  it('選ぶモード・補講あり・未選択だけがエラー', () => {
    expect(makeupSelectionError('pick', has('', []), cands)).toBe('補講を選んでください')
    // 非表示の手入力が残っていても、選んでいなければエラー（保存されるのは選んだ補講だけ）
    expect(makeupSelectionError('pick', has('2026-09-30', [4]), cands)).toBe('補講を選んでください')
  })

  it('選択済みなら null。日付・時限が同じでも教室が違えば未選択（保存されるのは選んだ補講の教室でなければならない）', () => {
    expect(makeupSelectionError('pick', makeupFormValues(standalone()), cands)).toBeNull()
    expect(makeupSelectionError('pick', has('2026-09-23', [3], 'K404'), cands)).toBe('補講を選んでください')
  })

  it('手入力モード・補講あり以外・候補0件は対象外', () => {
    expect(makeupSelectionError('manual', has('', []), cands)).toBeNull()
    expect(makeupSelectionError('pick', { makeupStatus: 'none', mkDate: '', mkPeriods: [], mkRoom: '' }, cands)).toBeNull()
    expect(makeupSelectionError('pick', { makeupStatus: 'undecided', mkDate: '', mkPeriods: [], mkRoom: '' }, cands)).toBeNull()
    expect(makeupSelectionError('pick', has('', []), [])).toBeNull()
  })
})

describe('shouldFocusMakeupCard: 初回に補講欄へ寄せる条件', () => {
  const base = { editId: 'c1', type: 'cancel' as const, makeupStatus: 'undecided' as const, candidateCount: 1 }
  it('編集・休講・補講未定・候補あり のときだけ', () => {
    expect(shouldFocusMakeupCard(base)).toBe(true)
    expect(shouldFocusMakeupCard({ ...base, editId: undefined })).toBe(false)
    expect(shouldFocusMakeupCard({ ...base, type: 'roomChange' })).toBe(false)
    expect(shouldFocusMakeupCard({ ...base, makeupStatus: 'has' })).toBe(false)
    expect(shouldFocusMakeupCard({ ...base, makeupStatus: 'none' })).toBe(false)
    expect(shouldFocusMakeupCard({ ...base, candidateCount: 0 })).toBe(false)
  })
})

describe('性質: 選べる補講は、保存後に必ず休講に覆われる', () => {
  // フォームの保存と同じ組み立て（科目名・コードはルート引数＝時間割側の値で上書き）を通す。
  const route = (courseName: string, courseCode: string | null) => ({ courseName, courseCode })
  const input = (r: { courseName: string; courseCode: string | null }, s: ClassEvent): ClassEventFormInput => ({
    editId: undefined, ...r, type: 'cancel', date: '2026-10-21', periods: [3], room: '', note: '',
    ...makeupFormValues(s), countdown: EMPTY_COUNTDOWN_FORM,
  })

  const ROUTES = [
    route('図学・製図', '9973415'),
    route('図学・製図', null),
    route('図学・製図', ''),
    route('図学 ・ 製図', '9973415'),
    route('図学　・　製図', null),
  ]
  const STANDALONES = [
    { courseCode: '9973415', courseName: '図学・製図' },
    { courseCode: null, courseName: '図学・製図' },
    { courseCode: '9973415', courseName: '別表記の図学' }, // コード一致・名称違い
    { courseCode: null, courseName: '図学　・製図' }, // 空白差
    { courseCode: '1111111', courseName: '図学・製図' }, // コード不一致
    { courseCode: null, courseName: '線形代数学１' }, // 別授業
  ]
  const PERIODS = [[3], [3, 4], [4, 3], [1, 2, 3]]

  it('全組合せで「選べる ⇒ 保存後に coveredStandaloneMakeups に入る」', () => {
    let pickedCount = 0
    for (const r of ROUTES) {
      for (const sc of STANDALONES) {
        for (const periods of PERIODS) {
          const s = standalone({ id: 'sx', ...sc, periods, date: '2026-09-23' })
          const pickable = pickableMakeups([s], { ...r, date: '2026-10-21' })
          if (pickable.length === 0) continue
          pickedCount++
          const saved = buildClassEventFromForm(input(r, pickable[0]), new Date(2026, 8, 1))
          const covered = coveredStandaloneMakeups([saved, s])
          expect(covered.has('sx'), `${JSON.stringify(r)} / ${JSON.stringify(sc)} / ${periods}`).toBe(true)
        }
      }
    }
    expect(pickedCount).toBeGreaterThan(20) // 空振り（何も検証していない）を防ぐ
  })

  it('別授業（コード不一致・名称も違う）の補講は選べない', () => {
    const s = standalone({ courseCode: '1111111' })
    const at = { date: '2026-10-21' }
    expect(pickableMakeups([s], { ...route('図学・製図', '9973415'), ...at })).toEqual([])
    const t = standalone({ courseCode: null, courseName: '線形代数学１' })
    expect(pickableMakeups([t], { ...route('図学・製図', '9973415'), ...at })).toEqual([])
  })
})

describe('eventLabels: 曜日つきの日付・行の文言・読み上げ名', () => {
  it('shortDateWithWeekday: 9/23(水)。不正な文字列はそのまま返す', () => {
    expect(shortDateWithWeekday('2026-09-23')).toBe('9/23(水)')
    expect(shortDateWithWeekday('2026-10-21')).toBe('10/21(水)')
    expect(shortDateWithWeekday('2026-09-27')).toBe('9/27(日)')
    expect(shortDateWithWeekday('2026-09-26')).toBe('9/26(土)')
    expect(shortDateWithWeekday('未定')).toBe('未定')
    expect(shortDateWithWeekday('2026-02-31')).toBe('2026-02-31')
  })

  it('makeupPickRowText: 日付・時限・教室（教室が無ければ付けない・複数コマは「3・4限」）', () => {
    expect(makeupPickRowText(standalone())).toBe('9/23(水) 3限・野：1211教室')
    expect(makeupPickRowText(standalone({ room: null }))).toBe('9/23(水) 3限')
    expect(makeupPickRowText(standalone({ periods: [4, 3] }))).toBe('9/23(水) 3・4限・野：1211教室')
  })

  it('makeupPickA11yLabel: 名詞で終える（選択状態と重複読みしない）', () => {
    expect(makeupPickA11yLabel(standalone())).toBe('9月23日 3限 野：1211教室 の補講')
    expect(makeupPickA11yLabel(standalone({ room: null, periods: [3, 4] }))).toBe('9月23日 3・4限 の補講')
  })

  it('makeupPickA11yLabel: メモがある行はそれが読み上げでも分かる（見た目では2行目に出ているため）', () => {
    expect(makeupPickA11yLabel(standalone({ note: '持ち物: 定規' }))).toBe('9月23日 3限 野：1211教室 の補講（メモあり）')
    expect(makeupPickA11yLabel(standalone({ note: '   ' }))).toBe('9月23日 3限 野：1211教室 の補講')
  })
})
