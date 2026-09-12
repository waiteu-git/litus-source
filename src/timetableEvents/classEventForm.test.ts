import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildClassEventFromForm,
  COUNTDOWN_CHOICES,
  COUNTDOWN_DATE_AFTER_EXAM,
  COUNTDOWN_DATE_REQUIRED,
  countdownChoiceLabel,
  countdownFormFromEvent,
  countdownPickerValue,
  countdownStartFromForm,
  dateToHm,
  EMPTY_COUNTDOWN_FORM,
  isExamType,
  startSettingLabel,
  validateCountdownForm,
  type ClassEventFormInput,
  type CountdownFormValue,
} from './classEventForm'
import { makeClassEventId, type ClassEvent, type ClassEventType, type CountdownStart } from './classEvent'
import { buildExamCountdown } from '../home/examCountdown'
import { deserializeClassEvents, serializeClassEvents } from '../storage/classEventsSerialize'

// 日時はローカルの成分で作る（'...Z' の文字列から作ると端末のタイムゾーンで結果が変わる）。
const NOW = new Date(2026, 6, 13, 14, 0) // 2026-07-13(月) 14:00
const ISO = NOW.toISOString()
const newId = (type: ClassEventFormInput['type'], date = '2026-07-15') =>
  makeClassEventId({ createdAt: ISO, courseName: '物理学基礎', type, date })

/** 画面の入力状態一式（ClassEventFormScreen の useState と同じ既定）。 */
function input(over: Partial<ClassEventFormInput> = {}): ClassEventFormInput {
  return {
    editId: undefined,
    courseName: '物理学基礎',
    courseCode: '9975311',
    type: 'cancel',
    date: '2026-07-15',
    periods: [1, 2],
    room: '',
    note: '',
    makeupStatus: 'undecided',
    mkDate: '',
    mkPeriods: [],
    mkRoom: '',
    countdown: EMPTY_COUNTDOWN_FORM,
    ...over,
  }
}

describe('buildClassEventFromForm（現行 onSave の組み立ての固定・設計 A §7-1）', () => {
  it('新規: id は now と内容から作り、createdAt は now の ISO', () => {
    const ev = buildClassEventFromForm(input({ type: 'other' }), NOW)
    expect(ev.id).toBe(newId('other'))
    expect(ev.createdAt).toBe(ISO)
  })

  it('編集: id は editId のまま、createdAt は保存時刻で上書き（現行挙動。直すのは範囲外）', () => {
    const ev = buildClassEventFromForm(input({ editId: 'evt_keep', type: 'other' }), NOW)
    expect(ev.id).toBe('evt_keep')
    expect(ev.createdAt).toBe(ISO)
  })

  it('休講・補講あり: 補講の日付・時限・教室（trim）を付け、休講そのものの教室は null', () => {
    const ev = buildClassEventFromForm(
      input({
        type: 'cancel',
        room: 'K101',
        note: ' 担当教員都合 ',
        makeupStatus: 'has',
        mkDate: '2026-07-22',
        mkPeriods: [3],
        mkRoom: ' K404 ',
      }),
      NOW,
    )
    expect(ev).toStrictEqual({
      id: newId('cancel'),
      courseName: '物理学基礎',
      courseCode: '9975311',
      type: 'cancel',
      date: '2026-07-15',
      periods: [1, 2],
      room: null,
      note: '担当教員都合',
      createdAt: ISO,
      makeupStatus: 'has',
      makeup: { date: '2026-07-22', periods: [3], room: 'K404' },
    })
  })

  it('休講・補講ありで補講の教室が空白だけなら null', () => {
    const ev = buildClassEventFromForm(input({ makeupStatus: 'has', mkDate: '2026-07-22', mkPeriods: [3], mkRoom: '   ' }), NOW)
    expect(ev.makeup).toStrictEqual({ date: '2026-07-22', periods: [3], room: null })
  })

  it('休講・補講なし／未定: makeup は null（補講の欄に入力が残っていても捨てる）', () => {
    for (const makeupStatus of ['none', 'undecided'] as const) {
      const ev = buildClassEventFromForm(input({ makeupStatus, mkDate: '2026-07-22', mkPeriods: [3], mkRoom: 'K404' }), NOW)
      expect(ev.makeupStatus).toBe(makeupStatus)
      expect(ev.makeup).toBe(null)
    }
  })

  it('教室変更: 教室を trim して付ける／空なら null。makeupStatus・makeup は付けない', () => {
    const ev = buildClassEventFromForm(input({ type: 'roomChange', room: ' K404 ' }), NOW)
    expect(ev.room).toBe('K404')
    expect('makeupStatus' in ev).toBe(false)
    expect('makeup' in ev).toBe(false)
    expect(buildClassEventFromForm(input({ type: 'roomChange', room: '  ' }), NOW).room).toBe(null)
  })

  it('補講（単独）: 教室を付ける', () => {
    expect(buildClassEventFromForm(input({ type: 'makeup', room: 'デモ棟305' }), NOW).room).toBe('デモ棟305')
  })

  it('小テスト・中間・期末・その他: 教室は入力があっても null、makeupStatus・makeup は付けない', () => {
    for (const type of ['quiz', 'midterm', 'final', 'other'] as const) {
      const ev = buildClassEventFromForm(
        input({ type, room: 'K101', makeupStatus: 'has', mkDate: '2026-07-22', mkPeriods: [3] }),
        NOW,
      )
      expect(ev).toStrictEqual({
        id: newId(type),
        courseName: '物理学基礎',
        courseCode: '9975311',
        type,
        date: '2026-07-15',
        periods: [1, 2],
        room: null,
        note: null,
        createdAt: ISO,
      })
    }
  })

  it('メモ: trim する・空白だけなら null', () => {
    expect(buildClassEventFromForm(input({ type: 'other', note: '  範囲は1〜4章 ' }), NOW).note).toBe('範囲は1〜4章')
    expect(buildClassEventFromForm(input({ type: 'other', note: '   ' }), NOW).note).toBe(null)
  })

  it('科目コードが無い手動の科目は null のまま', () => {
    expect(buildClassEventFromForm(input({ type: 'other', courseCode: null }), NOW).courseCode).toBe(null)
  })
})

const SCREEN = join(__dirname, '..', 'screens', 'ClassEventFormScreen.tsx')
const IMPORTS_BUILDER = /import\s*\{[^}]*\bbuildClassEventFromForm\b[^}]*\}\s*from\s*'\.\.\/timetableEvents\/classEventForm'/
const CALLS_BUILDER = /\bbuildClassEventFromForm\s*\(/
const BUILDS_INLINE = /:\s*ClassEvent\s*=\s*\{/

describe('R3: 予定フォームの画面は組み立てを classEventForm に任せる（ラチェット・設計 A §7-3）', () => {
  it('ClassEventFormScreen が buildClassEventFromForm を import して呼んでいる', () => {
    const src = readFileSync(SCREEN, 'utf8')
    expect(src).toMatch(IMPORTS_BUILDER)
    expect(src).toMatch(CALLS_BUILDER)
  })

  it('画面の中で ClassEvent のオブジェクトを直に組み立てていない', () => {
    expect(readFileSync(SCREEN, 'utf8')).not.toMatch(BUILDS_INLINE)
  })

  it('照合器の対照（陽性・陰性）', () => {
    expect("import { buildClassEventFromForm } from '../timetableEvents/classEventForm'").toMatch(IMPORTS_BUILDER)
    expect("import { buildClassEventFromFormX } from '../timetableEvents/classEventForm'").not.toMatch(IMPORTS_BUILDER)
    expect('const ev = buildClassEventFromForm(form, new Date())').toMatch(CALLS_BUILDER)
    expect('    const ev: ClassEvent = {').toMatch(BUILDS_INLINE)
    expect('const list: ClassEvent[] = []').not.toMatch(BUILDS_INLINE)
  })
})

const exam = (o: Partial<ClassEvent> = {}): ClassEvent => ({
  id: 'evt_x',
  courseName: '線形代数学I',
  courseCode: 'C1',
  type: 'final',
  date: '2026-07-20',
  periods: [3],
  room: null,
  note: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  ...o,
})

describe('isExamType', () => {
  it('表示開始を持てる種類は、カウントダウンの対象（buildExamCountdown が拾う種類）と一致する', () => {
    const types: ClassEventType[] = ['cancel', 'makeup', 'roomChange', 'quiz', 'midterm', 'final', 'other']
    for (const type of types) {
      expect(isExamType(type)).toBe(buildExamCountdown([exam({ type, date: '2026-07-14' })], NOW).length === 1)
    }
    expect(types.filter(isExamType)).toEqual(['quiz', 'midterm', 'final'])
  })
})

describe('表示開始の選択肢と文言（設計 A §9-1）', () => {
  it('チップは6つで、この順・この文言', () => {
    expect(COUNTDOWN_CHOICES.map((c) => countdownChoiceLabel(c, 7))).toEqual([
      '全体の設定に従う（いま：7日前から）',
      '60日前から',
      '30日前から',
      '14日前から',
      '7日前から',
      '日時を指定',
    ])
  })

  it('「全体の設定に従う」には現在の全体設定を添える', () => {
    expect(countdownChoiceLabel('inherit', 'always')).toBe('全体の設定に従う（いま：いつでも）')
    expect(countdownChoiceLabel('inherit', 60)).toBe('全体の設定に従う（いま：60日前から）')
    expect(startSettingLabel('always')).toBe('いつでも')
    expect(startSettingLabel(14)).toBe('14日前から')
  })
})

describe('countdownFormFromEvent / countdownStartFromForm（編集読み込みと保存の値）', () => {
  it('フィールドが無い予定は「全体の設定に従う」', () => {
    expect(countdownFormFromEvent(exam())).toStrictEqual(EMPTY_COUNTDOWN_FORM)
  })

  it('days と at をフォームの値へ戻し、そこから同じ値を作り直せる', () => {
    expect(countdownFormFromEvent(exam({ countdownStart: { kind: 'days', days: 30 } }))).toStrictEqual({
      choice: 30,
      date: '',
      time: '',
    })
    expect(countdownFormFromEvent(exam({ countdownStart: { kind: 'at', date: '2026-07-18', time: '08:30' } }))).toStrictEqual({
      choice: 'at',
      date: '2026-07-18',
      time: '08:30',
    })
    expect(countdownStartFromForm({ choice: 30, date: '', time: '' })).toStrictEqual({ kind: 'days', days: 30 })
    expect(countdownStartFromForm({ choice: 'at', date: '2026-07-18', time: '08:30' })).toStrictEqual({
      kind: 'at',
      date: '2026-07-18',
      time: '08:30',
    })
  })

  it('「全体の設定に従う」は null（フィールドを付けない）', () => {
    expect(countdownStartFromForm(EMPTY_COUNTDOWN_FORM)).toBe(null)
  })

  it('「日時を指定」で時刻を選んでいなければ 00:00（設計 A §9-2）', () => {
    expect(countdownStartFromForm({ choice: 'at', date: '2026-07-18', time: '' })).toStrictEqual({
      kind: 'at',
      date: '2026-07-18',
      time: '00:00',
    })
  })

  it('「日時を指定」で日付が無い・壊れていれば null（検査を通らない値は作らない）', () => {
    expect(countdownStartFromForm({ choice: 'at', date: '', time: '08:30' })).toBe(null)
    expect(countdownStartFromForm({ choice: 'at', date: '2026-02-31', time: '08:30' })).toBe(null)
  })
})

describe('validateCountdownForm（保存時の検査・設計 A §4-4）', () => {
  const at = (date: string, time = '') => ({ choice: 'at' as const, date, time })

  it('日付が空ならエラー', () => {
    expect(validateCountdownForm('quiz', '2026-07-20', at(''))).toBe(COUNTDOWN_DATE_REQUIRED)
  })

  it('試験日より後はエラー／試験日と同じ日は可', () => {
    expect(validateCountdownForm('midterm', '2026-07-20', at('2026-07-21'))).toBe(COUNTDOWN_DATE_AFTER_EXAM)
    expect(validateCountdownForm('midterm', '2026-07-20', at('2026-07-20', '23:00'))).toBe(null)
  })

  it('過去の日時は可（すぐ出るだけ）', () => {
    expect(validateCountdownForm('final', '2026-07-20', at('2026-01-05', '09:00'))).toBe(null)
  })

  it('「日時を指定」以外は検査しない', () => {
    expect(validateCountdownForm('quiz', '2026-07-20', EMPTY_COUNTDOWN_FORM)).toBe(null)
    expect(validateCountdownForm('quiz', '2026-07-20', { choice: 7, date: '', time: '' })).toBe(null)
  })

  it('陰性: 種類が試験以外なら、「日時を指定」で日付が空でもエラーにしない', () => {
    for (const type of ['cancel', 'roomChange', 'makeup', 'other'] as const) {
      expect(validateCountdownForm(type, '2026-07-20', at(''))).toBe(null)
    }
  })

  it('文言は承認済みのもの', () => {
    expect(COUNTDOWN_DATE_REQUIRED).toBe('表示を始める日付を選んでください')
    expect(COUNTDOWN_DATE_AFTER_EXAM).toBe('表示を始める日は試験日より後にできません')
  })
})

describe('ピッカーとの変換', () => {
  it('countdownPickerValue: 日付・時刻があればその日時、無ければ今日の0:00', () => {
    const v = countdownPickerValue({ choice: 'at', date: '2026-07-18', time: '08:30' }, NOW)
    expect([v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes()]).toEqual([2026, 6, 18, 8, 30])
    const d = countdownPickerValue({ choice: 'at', date: '', time: '' }, NOW)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 6, 13, 0, 0])
  })

  it('dateToHm: ローカルの HH:mm（ゼロ埋め）', () => {
    expect(dateToHm(new Date(2026, 6, 13, 8, 5))).toBe('08:05')
    expect(dateToHm(new Date(2026, 6, 13, 23, 59))).toBe('23:59')
  })
})

/** 画面の編集読み込み（ClassEventFormScreen の useEffect の setX 列）と同じ写し方。 */
function inputFromSaved(e: ClassEvent): ClassEventFormInput {
  return {
    editId: e.id,
    courseName: e.courseName,
    courseCode: e.courseCode,
    type: e.type,
    date: e.date,
    periods: e.periods.length ? e.periods : [1],
    room: e.room ?? '',
    note: e.note ?? '',
    makeupStatus: e.makeupStatus ?? 'undecided',
    mkDate: e.makeup?.date ?? '',
    mkPeriods: e.makeup?.periods ?? [],
    mkRoom: e.makeup?.room ?? '',
    countdown: countdownFormFromEvent(e),
  }
}

describe('buildClassEventFromForm の表示開始（設計 A §7-2D）', () => {
  it('🔴 往復: 保存済みの試験を開き、メモだけ直して保存しても表示開始が残る（days／at）', () => {
    const starts: CountdownStart[] = [
      { kind: 'days', days: 60 },
      { kind: 'days', days: 7 },
      { kind: 'at', date: '2026-07-18', time: '08:30' },
    ]
    for (const cs of starts) {
      const saved = exam({ id: 'evt_saved', note: '範囲は1〜4章', countdownStart: cs })
      const [stored] = deserializeClassEvents(serializeClassEvents([saved]))
      const rebuilt = buildClassEventFromForm({ ...inputFromSaved(stored), note: '範囲は1〜5章' }, NOW)
      const [back] = deserializeClassEvents(serializeClassEvents([rebuilt]))
      expect(back.countdownStart).toStrictEqual(cs)
      expect(back.note).toBe('範囲は1〜5章')
    }
  })

  it('対照: 編集読み込みで表示開始を戻し忘れると、メモだけの保存で消える（ラチェットが守っている罠）', () => {
    const saved = exam({ id: 'evt_saved', countdownStart: { kind: 'days', days: 60 } })
    const rebuilt = buildClassEventFromForm({ ...inputFromSaved(saved), countdown: EMPTY_COUNTDOWN_FORM }, NOW)
    expect('countdownStart' in rebuilt).toBe(false)
  })

  it('「全体の設定に従う」ならフィールドが無い', () => {
    for (const type of ['quiz', 'midterm', 'final'] as const) {
      expect('countdownStart' in buildClassEventFromForm(input({ type }), NOW)).toBe(false)
    }
  })

  it('種類を試験から休講・その他へ変えて保存するとフィールドが無い（days・at とも）', () => {
    const values: CountdownFormValue[] = [
      { choice: 14, date: '', time: '' },
      { choice: 'at', date: '2026-07-14', time: '08:30' },
    ]
    for (const countdown of values) {
      // 陽性の対照: 試験なら付く
      expect(buildClassEventFromForm(input({ type: 'quiz', countdown }), NOW).countdownStart).toBeDefined()
      for (const type of ['cancel', 'other'] as const) {
        expect('countdownStart' in buildClassEventFromForm(input({ type, countdown }), NOW)).toBe(false)
      }
    }
  })

  it('時刻を選ばずに「日時を指定」で保存すると 00:00 で残る', () => {
    const ev = buildClassEventFromForm(input({ type: 'midterm', countdown: { choice: 'at', date: '2026-07-14', time: '' } }), NOW)
    expect(ev.countdownStart).toStrictEqual({ kind: 'at', date: '2026-07-14', time: '00:00' })
  })
})

describe('予定フォームの配線（設計 A 禁止事項3・§4-4 のラチェット）', () => {
  const src = () => readFileSync(SCREEN, 'utf8')
  const onPickedBody = (s: string) => s.slice(s.indexOf('function onPicked('), s.indexOf('async function onSave('))

  it('編集読み込みで、保存済みの表示開始をフォームへ戻している', () => {
    expect(src()).toMatch(/setCountdown\(countdownFormFromEvent\(e\)\)/)
  })

  it('保存時に表示開始を検査している', () => {
    expect(src()).toMatch(/validateCountdownForm\(type, date, countdown\)/)
  })

  it('🔴 onPicked は状態ごとの明示の分岐（まとめて補講日へ流さない）で、日付の確定で時刻シートを自動で開かない', () => {
    const body = onPickedBody(src())
    expect(body.length).toBeGreaterThan(0)
    for (const c of ["case 'date':", "case 'mkDate':", "case 'startDate':", "case 'startTime':"]) {
      expect(body).toContain(c)
    }
    expect(body).toMatch(/const unreachable: never = which/)
    expect(body).not.toMatch(/\belse\b/)
    expect(body).not.toMatch(/setPicker\('startTime'\)/)
  })

  it('新しいチップは役割と選択状態を持ち、時刻のシートは24時間表記', () => {
    const s = src()
    const chips = s.slice(s.indexOf('COUNTDOWN_CHOICES.map('), s.indexOf('countdownChoiceLabel(c, examCountdownStart)'))
    expect(chips.length).toBeGreaterThan(0)
    expect(chips).toContain('accessibilityRole="button"')
    expect(chips).toContain('accessibilityState={{ selected: on }}')
    expect(s).toMatch(/mode="time"\s+is24Hour/)
  })

  it('照合器の対照: 変更前の onPicked（else で補講日へ落とす形）は赤になる', () => {
    const before =
      "function onPicked(d: Date) {\n    if (which === 'date') setDate(dateToYmd(d))\n    else setMkDate(dateToYmd(d))\n  }\n\n  async function onSave() {"
    const body = onPickedBody(before)
    expect(body).toMatch(/\belse\b/)
    expect(body).not.toContain("case 'startDate':")
  })
})
