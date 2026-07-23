/**
 * LETUS(Moodle) コースページ・課題ページ系パーサの「実DOM」回帰テスト（spec T2）。
 *
 * 目的: 現行 LETUS(4.5.8) が将来 Moodle 5.x(BS5) に上がったときに、どのパース経路が生き残り、
 * どこが壊れるかを **実採取HTML** で常時固定する。最も壊れやすいコースページ系
 * （`letusLinks.ts` / `courseUpdates.ts` / `INJECT_COURSE_ADD_BUTTONS_JS`）には従来 実DOM
 * テストが皆無で、CI で破損を検出できなかった（spec §1 の最大の穴）。
 *
 * fixture:
 *  - 実 Moodle 5.2 : `__fixtures__/moodle52/{course52_raw,my52_raw,assign52_ja,assign52_en}.html`
 *                    （school.moodledemo.net 実採取・provenance は同ディレクトリ README.md）
 *  - レガシー BS4  : `__fixtures__/course-bs4-representative.html`
 *                    （合成・非実採取。`.activityinstance` 旧構造の後方互換を固定する目的）
 *  - 実 4.5.8 課題 : `__fixtures__/assign-{submitted,not-submitted}-real.html`（TUS 実機・既存）
 *
 * WebView 注入スクリプト（INJECT系）は本来ブラウザ DOM 上で動くが、本リポには jsdom を追加しない
 * 方針のため、注入スクリプトが使う **セレクタ文字列を実コードから正規表現で取り出し**、
 * 既存依存の node-html-parser（`querySelectorAll` 対応）で実DOMに当てて等価検証する。
 * セレクタが実コードで変われば本テストのセレクタ抽出も追随する（ドリフト防止）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'node-html-parser'
import { extractAssignmentLinks } from './letusLinks'
import { computeCourseSignature } from '../updates/courseUpdates'
import { parseMyCourses } from './letusCourses'
import { parseAssignmentPage } from './letus'
import { INJECT_COURSE_ADD_BUTTONS_JS } from '../collect/injectedScripts'

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

const BASE = 'https://letus.ed.tus.ac.jp'

const course52 = read('./__fixtures__/moodle52/course52_raw.html')
const my52 = read('./__fixtures__/moodle52/my52_raw.html')
const my52Hydrated = read('./__fixtures__/moodle52/my52_hydrated.html')
const assign52Ja = read('./__fixtures__/moodle52/assign52_ja.html')
const assign52En = read('./__fixtures__/moodle52/assign52_en.html')
const courseBs4 = read('./__fixtures__/course-bs4-representative.html')

/**
 * INJECT_COURSE_ADD_BUTTONS_JS 内で活動リンクを拾うセレクタ（`li.activity a.aalink, ...`）を
 * 実コードから抽出する。注入スクリプトには複数の querySelectorAll があるので、`li.activity` を
 * 含む節だけを取る。抽出に失敗したらテストを落とす（＝コード側のセレクタ改名を検知）。
 */
function extractActivitySelector(injectJs: string): string {
  const m = injectJs.match(/querySelectorAll\('([^']*li\.activity[^']*)'\)/)
  if (!m) throw new Error('INJECT_COURSE_ADD_BUTTONS_JS から活動リンクセレクタを抽出できない')
  return m[1]
}

const ACTIVITY_SELECTOR = extractActivitySelector(INJECT_COURSE_ADD_BUTTONS_JS)

describe('T2: 活動リンク検出（URL方式・テーマ非依存）— 5.2 で生存すべき', () => {
  it('computeCourseSignature が 5.2 実コースページで 20 件の /mod/*/view.php を拾う', () => {
    const sig = computeCourseSignature(course52, `${BASE}/course/view.php?id=62`)
    expect(sig.length).toBe(20)
    // タイトルが空文字に劣化していない（課題名が取れている）
    expect(sig.every((a) => a.title.trim().length > 0)).toBe(true)
    expect(sig.some((a) => /\/mod\/assign\/view\.php/.test(a.url))).toBe(true)
  })

  it('extractAssignmentLinks(standard) が 5.2 実コースページで課題系リンクを拾う', () => {
    const links = extractAssignmentLinks(course52, `${BASE}/course/view.php?id=62`, 'standard')
    expect(links.length).toBeGreaterThan(0)
    // assign/quiz が含まれる（URL パス方式なので BS5 のクラス改名に非依存）
    expect(links.some((l) => /\/mod\/assign\/view\.php/.test(l.url))).toBe(true)
  })

  it('レガシー BS4 コースページ（.activityinstance 旧構造）でも URL 方式は同数を拾う', () => {
    const links = extractAssignmentLinks(courseBs4, `${BASE}/course/view.php?id=1`, 'standard')
    // assign + quiz の2件（resource/label は課題系でない）
    expect(links.length).toBe(2)
    expect(links.map((l) => l.url).sort()).toEqual([
      `${BASE}/mod/assign/view.php?id=101`,
      `${BASE}/mod/quiz/view.php?id=102`,
    ])
  })
})

describe('T2: INJECT_COURSE_ADD_BUTTONS_JS のセレクタを実DOMに当てる', () => {
  it('セレクタは li.activity a.aalink 系を含む（実コードから抽出できている）', () => {
    expect(ACTIVITY_SELECTOR).toContain('li.activity a.aalink')
  })

  it('5.2 実コースページで活動アンカーを 20 件マッチ（aalink は 5.2 でも維持）', () => {
    const root = parse(course52)
    const found = root.querySelectorAll(ACTIVITY_SELECTOR)
    expect(found.length).toBe(20)
  })

  it('5.2 で instancename から表示名を取り出せる（＋追加ボタンのラベルが空にならない）', () => {
    const root = parse(course52)
    const a = root.querySelectorAll(ACTIVITY_SELECTOR)[0]
    const nameEl = a.querySelector('.instancename')
    expect(nameEl).not.toBeNull()
    expect((nameEl!.textContent || '').trim().length).toBeGreaterThan(0)
  })

  it('5.2 で closest(li.activity) がホスト行を返す（ボタン挿入先の主経路が生存）', () => {
    const root = parse(course52)
    const a = root.querySelectorAll(ACTIVITY_SELECTOR)[0]
    expect(a.closest('li.activity')).not.toBeNull()
  })

  it('レガシー BS4 でも同セレクタが活動アンカーを拾う（後方互換）', () => {
    const root = parse(courseBs4)
    const found = root.querySelectorAll(ACTIVITY_SELECTOR)
    // assign/quiz/resource の3活動（label は mod リンクなし）
    expect(found.length).toBe(3)
    expect(found.every((a) => /\/mod\//.test(a.getAttribute('href') || ''))).toBe(true)
  })
})

describe('T2: 課題ページの締切・状態パース — 5.2 日本語は生存', () => {
  it('assign52_ja（5.2 JA）は締切ISOと未提出状態を解決する', () => {
    const res = parseAssignmentPage(assign52Ja, `${BASE}/mod/assign/view.php?id=724`)
    expect(res.deadline).not.toBeNull()
    // 「まだ提出されていません。」を not_submitted と判定できている（Litus は対応済み）
    expect(res.submissionStatus).toBe('not_submitted')
  })
})

/**
 * === 5.2 で実際に壊れる箇所（T7/T5 の入力）===
 * it.fails は「本来こう動くべき」assertion を書き、現状は失敗する＝壊れを可視化する。
 * T5/T7 で修正されると it.fails が「予期せず成功」で赤くなり、.fails を外す作業を強制する（ラチェット）。
 */
describe('T2: 5.2 で壊れる箇所（expected failure・ラチェット）', () => {
  // 破損①【最重大】: RAW Dashboard(my/courses.php) が course/view.php アンカーを一切持たない
  // （全面クライアント描画・data-totalcoursecount="19" なのにアンカー0）。→ T5 ハイドレーション待ち。
  it.fails('破損①: parseMyCourses は 5.2 RAW Dashboard でコースを拾えるべき（現状 0 件）', () => {
    const courses = parseMyCourses(my52, BASE)
    expect(courses.length).toBeGreaterThan(0)
  })

  // 破損①の対極（T5 の到達点）: 同じ 5.2 Dashboard でも「ハイドレーション後」の実DOM
  // （2026-07-24 に school.moodledemo.net で実採取・student=19コース中 In progress 10件表示）なら
  // parseMyCourses は全カードを拾える。T5 の待ち機構が待っているのはこの状態＝
  // RAW=0件 と合わせて「待てば取れる・待てなければ診断が鳴る」の両端を fixture で固定する。
  it('破損①の解: ハイドレーション後 Dashboard（my52_hydrated）からはコースを拾える', () => {
    const courses = parseMyCourses(my52Hydrated, BASE)
    expect(courses.length).toBe(10)
    for (const c of courses) expect(c.url).toMatch(/\/course\/view\.php\?id=\d+/)
  })

  // 破損②【T7で解決済み】: 英語課題ページの日付書式 "Tuesday, 12 December 2023, 12:00 AM"。
  // 現行 regex（和文のみ）では未対応で deadline=null だった。parseDeadline に英語 %B 書式の
  // OR 分岐を追加（曜日任意・12時間AM/PM補正）→ 締切を解決できるようにした。
  it('破損②[修正済]: assign52_en（5.2 EN）は締切を解決する', () => {
    const res = parseAssignmentPage(assign52En, `${BASE}/mod/assign/view.php?id=724`)
    expect(res.deadline).not.toBeNull()
    // "Tuesday, 12 December 2023, 12:00 AM"（12:00 AM=00:00・ローカルタイム）を正しく読む。
    expect(res.deadline).toBe(new Date(2023, 11, 12, 0, 0, 0, 0).toISOString())
  })

  // 破損③【T7で解決済み】: 英語課題ページの未提出値 "No submissions have been made yet" を
  // 状態文言テーブルに収録（'no submissions have been made'）→ not_submitted と解決する。
  it('破損③[修正済]: assign52_en（5.2 EN）は未提出状態を解決する', () => {
    const res = parseAssignmentPage(assign52En, `${BASE}/mod/assign/view.php?id=724`)
    expect(res.submissionStatus).toBe('not_submitted')
  })
})

/**
 * === 5.2 の構造変化の特性固定（破損ではないが記録）===
 * `.activityinstance` は Moodle 4.4 で `.activity-item` へ再設計され、5.2 では 0 件になる。
 * INJECT セレクタ第3節 `.activityinstance a[href*="/mod/"]` は 5.2 で死ぬが、第1/2節
 * （aalink・href*=/mod/）が拾うので活動収集は生存する＝第3節は冗長化している。
 * closest('.activityinstance') フォールバックも 5.2 で null になるが、主経路 closest('li.activity')
 * が生きているのでボタン挿入は成功する。
 */
describe('T2: 5.2 の構造変化（.activityinstance 廃止）の記録', () => {
  it('5.2 では .activityinstance が 0 件（旧クラスは廃止）', () => {
    const root = parse(course52)
    expect(root.querySelectorAll('.activityinstance').length).toBe(0)
  })

  it('5.2 では .activity-item が活動行に付く（新クラス）', () => {
    const root = parse(course52)
    expect(root.querySelectorAll('.activity-item').length).toBeGreaterThan(0)
  })

  it('レガシー BS4 では .activityinstance が存在する（後方互換節が効く旧環境）', () => {
    const root = parse(courseBs4)
    expect(root.querySelectorAll('.activityinstance').length).toBeGreaterThan(0)
  })

  it('INJECT セレクタ第3節（.activityinstance）は 5.2 で 0 件＝冗長、主経路が全件を拾う', () => {
    const root = parse(course52)
    const legacyClause = root.querySelectorAll('.activityinstance a[href*="/mod/"]').length
    const full = root.querySelectorAll(ACTIVITY_SELECTOR).length
    expect(legacyClause).toBe(0)
    expect(full).toBe(20)
  })
})

/**
 * === T7: 注入ボタン(INJECT_COURSE_ADD_BUTTONS_JS)の安定フック優先化 ===
 * ボタンUIのホスト特定とリンク収集を「URL/構造の安定フック優先・CSSクラスはフォールバック」へ整理。
 * 収集本体(letusLinks.ts)は元々 URL 正規表現方式でテーマ非依存だが、ボタンUIの注入JSにも
 * 同じ保険（クラス総崩れ時に /mod/ アンカーへフォールバック）を入れて崖を無くす（spec§8 原則1）。
 */
describe('T7: 注入ボタンのセレクタ整理（安定フック優先化）', () => {
  it('ホスト候補に .activity-item を追加（5.2 の新構造でもボタン挿入先が取れる）', () => {
    expect(INJECT_COURSE_ADD_BUTTONS_JS).toContain(".closest('li.activity')")
    expect(INJECT_COURSE_ADD_BUTTONS_JS).toContain(".closest('.activity-item')")
  })

  it('主経路が 0 件のときだけ /mod/ アンカーの URL フォールバックへ落ちる', () => {
    // `if (!links.length)` ガードの直後に URL 方式の再取得がある＝現行 4.5.8/5.2 では主経路が
    // ヒットするのでフォールバックは発火せず、挙動ゼロ変更（加算的耐性層）。
    expect(INJECT_COURSE_ADD_BUTTONS_JS).toMatch(
      /if\s*\(!links\.length\)\s*\{[\s\S]*?querySelectorAll\('a\[href\*="\/mod\/"\]'\)/,
    )
  })

  it('主経路(li.activity/aalink)が総崩れした将来テーマでも URL 方式なら活動を拾える', () => {
    // li.activity も aalink も .activityinstance も無い仮想テーマ。従来の主経路は 0 件になるが、
    // /mod/*/view.php の URL 規約は安定＝フォールバック選択子が課題アンカーを拾える。
    const futureTheme = `
      <div class="course-content">
        <div class="section-item"><a class="cm-name" href="${BASE}/mod/assign/view.php?id=901">課題A</a></div>
        <div class="section-item"><a class="cm-name" href="${BASE}/mod/quiz/view.php?id=902">小テストB</a></div>
        <nav><a href="${BASE}/user/view.php?id=5">プロフィール</a></nav>
      </div>`
    const root = parse(futureTheme)
    expect(root.querySelectorAll(ACTIVITY_SELECTOR).length).toBe(0)
    const fallback = root.querySelectorAll('a[href*="/mod/"]')
    expect(fallback.length).toBe(2)
    // 収集本体(letusLinks)は同じ URL 方式でこのテーマからも課題を拾える（ボタンUIと整合）。
    const links = extractAssignmentLinks(futureTheme, `${BASE}/course/view.php?id=99`, 'standard')
    expect(links.map((l) => l.url).sort()).toEqual([
      `${BASE}/mod/assign/view.php?id=901`,
      `${BASE}/mod/quiz/view.php?id=902`,
    ])
  })
})
