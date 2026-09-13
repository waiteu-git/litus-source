import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const settingsSrc = () => readFileSync(join(ROOT, 'src/screens/SettingsScreen.tsx'), 'utf8')
const navTypesSrc = () => readFileSync(join(ROOT, 'src/navigation/types.ts'), 'utf8')

// 区切り線（フラット行＋ヘアライン）の形。陽性・陰性の両方でこの1つの定義を使う。
const DIVIDER = /borderTopWidth:\s*StyleSheet\.hairlineWidth,\s*borderTopColor:\s*ui\.dividerColor/

/**
 * アンカー文字列で囲まれた範囲だけを切り出す。**アンカーが見つからない場合は明示的に失敗させる。**
 * indexOf が -1 のまま slice すると意図せず空文字列になり、以降の否定チェック（「〜が出現しない」）が
 * 常にPASSする＝守るべきものを守れなくなったことに誰も気づけない（fail-open）。
 * リファクタで見出し文言が変わった時に、沈黙ではなくテスト失敗として気づけるようにする。
 */
function sliceSection(src: string, startAnchor: string, endAnchor: string): string {
  const start = src.indexOf(startAnchor)
  expect(start, `開始アンカーが見つからない: ${startAnchor}`).toBeGreaterThan(-1)
  const end = src.indexOf(endAnchor, start)
  expect(end, `終端アンカーが見つからない: ${endAnchor}`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('Task 2: 並べ替えUIが別画面（SectionOrder）へ移っている', () => {
  it('navigation/types.ts に SectionOrder ルートがある', () => {
    expect(navTypesSrc()).toMatch(/SectionOrder:\s*\{\s*target:\s*'home'\s*\|\s*'subject'\s*\}/)
  })

  it('SettingsScreen.tsx は SectionLayoutReorder を直接使わない（別画面へ移した）', () => {
    expect(settingsSrc()).not.toMatch(/<SectionLayoutReorder/)
  })

  it('SettingsScreen.tsx が SectionOrder への navigate を2回（home・subject）含む', () => {
    const src = settingsSrc()
    const matches = src.match(/navigate\('SectionOrder',\s*\{\s*target:\s*'(home|subject)'\s*\}\)/g) ?? []
    expect(matches.length).toBe(2)
    expect(matches.some((m) => m.includes("'home'"))).toBe(true)
    expect(matches.some((m) => m.includes("'subject'"))).toBe(true)
  })
})

describe('Task 3: ライセンスが別画面（License）へ移っている', () => {
  it('SettingsScreen.tsx は FONT_LICENSE_TEXT を直接表示しない（別画面へ移した）', () => {
    expect(settingsSrc()).not.toMatch(/FONT_LICENSE_TEXT/)
  })

  it("SettingsScreen.tsx が navigate('License') を含む", () => {
    expect(settingsSrc()).toMatch(/navigate\('License'\)/)
  })
})

const subjectSrc = () => readFileSync(join(ROOT, 'src/screens/SubjectDetailScreen.tsx'), 'utf8')

describe('Task 4: 出欠詳細・実施パターンが別画面（SubjectSchedule）へ統合されている', () => {
  it('navigation/types.ts に SubjectSchedule ルートがある', () => {
    expect(navTypesSrc()).toMatch(
      /SubjectSchedule:\s*\{\s*courseCode:\s*string\s*name:\s*string\s*focus:\s*'attendance'\s*\|\s*'pattern'\s*\}/,
    )
  })

  it('SubjectDetailScreen.tsx は実施パターンの週リストUI（weekRow）を直接持たない', () => {
    expect(subjectSrc()).not.toMatch(/styles\.weekRow/)
  })

  it('SubjectDetailScreen.tsx は出欠の各回記録UI（attSessionRow）を直接持たない', () => {
    expect(subjectSrc()).not.toMatch(/styles\.attSessionRow/)
  })

  it('SubjectDetailScreen.tsx が SubjectSchedule への navigate を focus=attendance と focus=pattern の両方で含む', () => {
    const src = subjectSrc()
    expect(src).toMatch(/navigate\('SubjectSchedule',\s*\{[^}]*focus:\s*'attendance'/)
    expect(src).toMatch(/navigate\('SubjectSchedule',\s*\{[^}]*focus:\s*'pattern'/)
  })

  it('SubjectDetailScreen.tsx は courseNews と同様、useFocusEffect で出欠統計を読み込む', () => {
    // 陰性対照: 単なる useEffect ではなく useFocusEffect であること（戻ってきた時に最新化するため）。
    expect(subjectSrc()).toMatch(/useFocusEffect\(\s*useCallback\(\s*\(\)\s*=>\s*\{[^]*?loadAttendanceStats/)
  })

  // 実施パターンの唯一の書き手は SubjectSchedule 画面になったため、出欠統計と対称に扱わないと
  // 「編集して戻っても LinkRow のサブタイトル・risk・次回行が古いまま」になる。
  // `(?!useEffect\()` の番人で「useFocusEffect のブロックを出て別の useEffect に入った」形を弾く
  // （`useFocusEffect(` は `useEffect(` を部分文字列として含まないので番人はブロック内では発火しない）。
  const focusLoadsPattern = /useFocusEffect\(\s*useCallback\(\s*\(\)\s*=>\s*\{(?:(?!useEffect\()[^])*?loadWeeklyPatterns/

  it('SubjectDetailScreen.tsx は実施パターンも useFocusEffect で読み込む（陽性）', () => {
    expect(subjectSrc()).toMatch(focusLoadsPattern)
  })

  it('素の useEffect で実施パターンを読む形はこのラチェットで弾かれる（陰性対照）', () => {
    // 対照: 本命と*違う*応答を返すことを示す。修正前の形（useFocusEffect の外の素の useEffect）は
    // 同じ正規表現で不一致になる＝このラチェットは実際に失敗しうる。
    const before = `
      useFocusEffect(useCallback(() => {
        loadAttendanceStats()
      }, [courseCode]))

      useEffect(() => {
        loadWeeklyPatterns().then((m) => setPattern(m[courseCode] ?? {}))
      }, [courseCode])
    `
    expect(before).not.toMatch(focusLoadsPattern)
    // かつ、修正後の形は同じ正規表現で一致する（番人が正しい形まで巻き込んでいないことの確認）。
    const after = `
      useFocusEffect(useCallback(() => {
        const m = await loadWeeklyPatterns()
      }, [courseCode]))
    `
    expect(after).toMatch(focusLoadsPattern)
  })

  it('移設先（SubjectScheduleScreen.tsx）に出欠の各回記録の区切り線パターンが実在する', () => {
    // 「移した」の受け手側の確認。Task 5 の陽性対照ではなく Task 4（移設）の一部なのでこちらに置く。
    const scheduleSrc = readFileSync(join(ROOT, 'src/screens/SubjectScheduleScreen.tsx'), 'utf8')
    expect(scheduleSrc).toMatch(DIVIDER)
  })
})

describe('Task 5: 各回の予定がフラット行＋区切り線に統一されている', () => {
  // 「各回の予定」Accordion の中身だけを見る（陽性・陰性で同じスコープを使う）。ファイル全体で
  // 数えると、このセクションが区切り線を失っても別セクションの同一パターンで陽性がPASSしうる。
  const eventsSection = () => sliceSection(subjectSrc(), 'title="各回の予定"', '</Accordion>')

  it('SubjectDetailScreen.tsx の candRow・eventRow に ui.card が付いていない（個別カード化の禁止）', () => {
    const section = eventsSection()
    expect(section).not.toMatch(/\[ui\.card,\s*styles\.candRow\]/)
    expect(section).not.toMatch(/\[ui\.card,\s*styles\.eventRow\]/)
  })

  it('SubjectDetailScreen.tsx の各回の予定は1つの箱＋区切り線になっている（陽性: 新しい構造の存在確認）', () => {
    // events セクションが単一の ui.card で候補・登録済み行を包み、行間に区切り線を持つこと。
    expect(eventsSection()).toMatch(DIVIDER)
  })
})

describe('Task 6: データの操作がフラット行＋区切り線に統一されている', () => {
  // 「データ」Accordion の中身だけを見る（陽性・陰性で同じスコープを使う）。素の src 全体を検索すると、
  // スコープ外の「不具合の報告」セクション（単発の1行アクションで、そもそも反復行ではないため
  // 個別カードのままで規約違反ではない）の同一パターンまで拾って誤検出するため。
  const dataSection = () => sliceSection(settingsSrc(), 'Accordion title="データ"', '</Accordion>')

  it('SettingsScreen.tsx の「データ」操作行に個別カード [ui.card, styles.rowBetween] が出現しない', () => {
    const matches = dataSection().match(/\[ui\.card,\s*styles\.rowBetween[^\]]*\]/g) ?? []
    // 1つの外枠カードにまとめた後は、この形自体が0件になっている想定(外枠は別スタイルにする)。
    expect(matches.length).toBe(0)
  })

  it('陽性: 「データ」操作行が区切り線パターンを複数持つ（1つの箱にまとまったことの確認）', () => {
    const dividerMatches = dataSection().match(new RegExp(DIVIDER.source, 'g')) ?? []
    // データの5操作のうち先頭以外（デモ表示・ヒント再表示・全消去・出席送信の記録の最大4件）が区切り線を持つ。
    // デモ導線は demo フラグで描画されない場合があるため、最低3件を閾値にする。
    expect(dividerMatches.length).toBeGreaterThanOrEqual(3)
  })
})
