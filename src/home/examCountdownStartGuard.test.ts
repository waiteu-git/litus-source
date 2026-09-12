import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * ラチェット R2（設計 docs/design/2026-09-12-v11-train1-A.md §7-3）: 表示開始を読んでよい場所を縛る。
 *
 * 表示開始は**ホームの試験カウントダウンのカードだけ**に効かせる（合意 #4）。試験の通知（前夜20:00・当日8:00）、
 * 今日の変更、時間割のバッジ、学期終了判定の追加予定が読み始めると、通知や出席案内まで黙って変わる。
 * どれも型チェックもテストも通るので、参照先を許可リストで縛る。照合は語境界で行う
 * （型名 CountdownStart・setter の setExamCountdownStart・型 ExamCountdownStartSetting は拾わない）。
 * テストファイルは対象外（消費者のテストが「変わらないこと」を確かめるために参照している）。
 */
const SRC = join(__dirname, '..')
const FIELD = /\bcountdownStart\b/
const SETTING = /\bexamCountdownStart\b/

/** 試験ごとの表示開始（ClassEvent のフィールド）を参照してよいファイル。 */
const FIELD_ALLOW = new Set([
  'timetableEvents/classEvent.ts',
  'storage/classEventsSerialize.ts',
  'timetableEvents/classEventForm.ts',
  'home/examCountdown.ts',
  'screens/ClassEventFormScreen.tsx',
])
/** 全体の表示開始（DisplaySettings のフィールド）を参照してよいファイル。フォームは「いま：○○」の表示にだけ使う。 */
const SETTING_ALLOW = new Set([
  'storage/displaySettingsSerialize.ts',
  'displaySettings.tsx',
  'screens/SettingsScreen.tsx',
  'screens/HomeScreen.tsx',
  'screens/ClassEventFormScreen.tsx',
])

type Source = { rel: string; text: string }

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

function srcFiles(): Source[] {
  return listSources(SRC).map((f) => ({ rel: relative(SRC, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }))
}

function offenders(files: Source[], re: RegExp, allow: Set<string>): string[] {
  return files.filter((f) => !allow.has(f.rel) && re.test(f.text)).map((f) => f.rel)
}

/** src/ からの相対パスでソースを読む（配線のラチェットでも使う）。 */
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

describe('R2: 表示開始の参照先ガード（ラチェット）', () => {
  const files = srcFiles()

  it('countdownStart は許可リストの外（通知・今日の変更・時間割・学期終了判定など）で参照されない', () => {
    expect(offenders(files, FIELD, FIELD_ALLOW)).toEqual([])
  })

  it('examCountdownStart は許可リストの外で参照されない（判定の examCountdown.ts も引数名 startSetting で受ける）', () => {
    expect(offenders(files, SETTING, SETTING_ALLOW)).toEqual([])
  })

  it('許可リストが形骸化していない: 判定と保存が実際に参照している', () => {
    expect(read('home/examCountdown.ts')).toMatch(FIELD)
    expect(read('storage/classEventsSerialize.ts')).toMatch(FIELD)
    expect(read('storage/displaySettingsSerialize.ts')).toMatch(SETTING)
    expect(read('displaySettings.tsx')).toMatch(SETTING)
  })

  it('照合器の対照: 語境界で照合する', () => {
    expect("if (e.countdownStart?.kind === 'at')").toMatch(FIELD)
    expect('e.countdownStart = cs').toMatch(FIELD)
    expect('type CountdownStart = {').not.toMatch(FIELD)
    expect('const { examCountdownStart } = useDisplaySettings()').not.toMatch(FIELD)
    expect('const { examCountdownStart } = useDisplaySettings()').toMatch(SETTING)
    expect('setExamCountdownStart(v)').not.toMatch(SETTING)
    expect('ExamCountdownStartSetting').not.toMatch(SETTING)
  })

  it('陰性対照: 許可リストの外に置いた参照は違反として拾われ、許可リストの中なら拾われない', () => {
    const fake: Source[] = [
      { rel: 'notifications/notificationRefresh.ts', text: 'if (e.countdownStart) continue' },
      { rel: 'timetableEvents/eventSelectors.ts', text: 'const s = examCountdownStart' },
      { rel: 'home/examCountdown.ts', text: 'e.countdownStart' },
    ]
    expect(offenders(fake, FIELD, FIELD_ALLOW)).toEqual(['notifications/notificationRefresh.ts'])
    expect(offenders(fake, SETTING, SETTING_ALLOW)).toEqual(['timetableEvents/eventSelectors.ts'])
  })
})

describe('設定＞表示の配線（設計 A §9-1・§9-3）', () => {
  const s = read('screens/SettingsScreen.tsx')

  it('見出しは「課題の並び」と「ホームの並び」の間に置く', () => {
    const a = s.indexOf('>課題の並び<')
    const x = s.indexOf('>試験カウントダウンの表示開始<')
    const h = s.indexOf('>ホームの並び<')
    expect(a).toBeGreaterThan(-1)
    expect(x).toBeGreaterThan(a)
    expect(h).toBeGreaterThan(x)
  })

  it('5択の文言・注記・値の写し方（キーは文字列、戻す時は toExamCountdownStart で検める）', () => {
    for (const label of ["label: 'いつでも'", "label: '60日前'", "label: '30日前'", "label: '14日前'", "label: '7日前'"]) {
      expect(s).toContain(label)
    }
    expect(s).toContain(
      'ホームの試験カウントダウンに、試験の何日前から出すかを選べます。試験ごとの設定は各回の予定の編集で変えられます。試験の通知（前日20:00・当日8:00）は、この設定では変わりません。',
    )
    expect(s).toMatch(/value=\{String\(examCountdownStart\)\}/)
    expect(s).toMatch(/setExamCountdownStart\(toExamCountdownStart\(/)
  })
})

describe('ホームの配線（設計 A §4-4・禁止事項6）', () => {
  const CALL = /buildExamCountdown\(\s*classEvents,\s*tick,\s*3,\s*ttPeriodTimes,\s*examCountdownStart\s*\)/

  it('全体の表示開始を取り出し、buildExamCountdown の5番目の引数に渡している', () => {
    const s = read('screens/HomeScreen.tsx')
    expect(s).toMatch(/const \{ homeLayout, examCountdownStart \} = useDisplaySettings\(\)/)
    expect(s).toMatch(CALL)
  })

  it('照合器の対照: 5番目の引数を渡し忘れた呼び出し（既定の always で黙って効かない形）は拾わない', () => {
    expect('buildExamCountdown(classEvents, tick, 3, ttPeriodTimes)').not.toMatch(CALL)
    expect('buildExamCountdown(classEvents, tick, 3, ttPeriodTimes, examCountdownStart)').toMatch(CALL)
  })
})
