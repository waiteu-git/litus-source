/**
 * LETUS スキャンサイクル自己診断配線（scanDiagnostics）のテスト。
 *
 * 実 Moodle 5.2 fixture を各 observe* に流し、diagnose.ts の純関数まで含めた「配線の実経路」を検証する。
 * 中核は spec T5 の受入条件のうち診断側: RAW Dashboard（course/view.php アンカー0・M.cfg 有）に対し
 * ハイドレーション待ちが静的 fixture では 0 件のままでも、diagnose 配線が DASHBOARD_UNREADABLE として
 * 捕捉し、reducer の2連続閾値を経て activeCodes へ昇格する経路を固定する。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  classifyFetchedPage,
  createScanAccumulator,
  finalizeScanCodes,
  hasCourseFormatMarker,
  hasMoodleConfig,
  moduleTypeFromUrl,
  observeActivityPage,
  observeCoursePage,
  observeDashboard,
} from './scanDiagnostics'
import { parseMyCourses } from '../parsers/letusCourses'
import { parseAssignmentPage } from '../parsers/letus'
import { applyScanOutcome } from './diagnosticsState'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')
const BASE = 'https://letus.ed.tus.ac.jp'

const my52 = read('../parsers/__fixtures__/moodle52/my52_raw.html')
const course52 = read('../parsers/__fixtures__/moodle52/course52_raw.html')
const assign52Ja = read('../parsers/__fixtures__/moodle52/assign52_ja.html')
const assign52En = read('../parsers/__fixtures__/moodle52/assign52_en.html')

describe('HTML由来シグナル（版跨ぎ安定アンカー）', () => {
  it('hasMoodleConfig は 5.2 fixture の M.cfg を検知する', () => {
    expect(hasMoodleConfig(my52)).toBe(true)
    expect(hasMoodleConfig('<html><body>not moodle</body></html>')).toBe(false)
  })

  it('hasCourseFormatMarker は format-* クラスを検知する', () => {
    expect(hasCourseFormatMarker(course52)).toBe(true)
    expect(hasCourseFormatMarker('<body class="path-mod">x</body>')).toBe(false)
  })

  it('classifyFetchedPage: M.cfg有=logged_in / password欄=logged_out / どちらも無=unknown', () => {
    expect(classifyFetchedPage(my52)).toBe('logged_in')
    expect(classifyFetchedPage('<input type="password">')).toBe('logged_out')
    expect(classifyFetchedPage('<body>portal</body>')).toBe('unknown')
  })

  it('classifyFetchedPage: ログインマーカーは M.cfg より優先（学外SSOは logged_out）', () => {
    expect(classifyFetchedPage('M.cfg = {"sesskey":"x"}; <input type="password">')).toBe('logged_out')
  })

  it('moduleTypeFromUrl は /mod/<type>/view.php の型を返す', () => {
    expect(moduleTypeFromUrl(`${BASE}/mod/assign/view.php?id=1`)).toBe('assign')
    expect(moduleTypeFromUrl(`${BASE}/mod/quiz/view.php?id=1`)).toBe('quiz')
    expect(moduleTypeFromUrl(`${BASE}/course/view.php?id=1`)).toBeNull()
  })
})

describe('Dashboard 診断（DASHBOARD_UNREADABLE の実経路・T5 受入）', () => {
  it('5.2 RAW Dashboard は course/view.php アンカー0・M.cfg有（=logged_in）', () => {
    // ハイドレーション待ち後も静的 fixture では 0 件のまま（XHR 描画が無いため）。
    expect(parseMyCourses(my52, BASE).length).toBe(0)
    expect(classifyFetchedPage(my52)).toBe('logged_in')
  })

  it('既知コース>0 で 0 アンカーなら DASHBOARD_UNREADABLE を集約する', () => {
    const acc = createScanAccumulator()
    observeDashboard(acc, { html: my52, courseAnchorCount: 0, knownCourseCount: 5 })
    expect(finalizeScanCodes(acc)).toContain('DASHBOARD_UNREADABLE')
    expect(acc.reachedLetus).toBe(true)
  })

  it('既知コース0（初回）は正当な空＝発火しない', () => {
    const acc = createScanAccumulator()
    observeDashboard(acc, { html: my52, courseAnchorCount: 0, knownCourseCount: 0 })
    expect(finalizeScanCodes(acc)).toEqual([])
  })

  it('アンカーが取れていれば発火しない（健全）', () => {
    const acc = createScanAccumulator()
    observeDashboard(acc, { html: my52, courseAnchorCount: 8, knownCourseCount: 5 })
    expect(finalizeScanCodes(acc)).toEqual([])
  })

  it('DASHBOARD_UNREADABLE は reducer の2連続閾値で activeCodes へ昇格する', () => {
    const acc = createScanAccumulator()
    observeDashboard(acc, { html: my52, courseAnchorCount: 0, knownCourseCount: 5 })
    const codes = finalizeScanCodes(acc)
    // 1回目: 失敗カウント1・単発ではバナー化しない（activeCodes 空）。
    const s1 = applyScanOutcome(null, { codes, at: '2026-07-23T00:00:00.000Z' })
    expect(s1.consecutiveFailures).toBe(1)
    expect(s1.activeCodes).toEqual([])
    // 2回目連続: activeCodes へ昇格。
    const s2 = applyScanOutcome(s1, { codes, at: '2026-07-23T00:10:00.000Z' })
    expect(s2.consecutiveFailures).toBe(2)
    expect(s2.activeCodes).toContain('DASHBOARD_UNREADABLE')
  })
})

describe('コースページ診断（既知コースの喪失と横断集計）', () => {
  it('5.2 実コースページ（活動20件）は健全＝発火しない', () => {
    const acc = createScanAccumulator()
    observeCoursePage(acc, { html: course52, modAnchorCount: 20, prevSignatureLen: 20 })
    expect(finalizeScanCodes(acc)).toEqual([])
    expect(acc.trackedCourseCount).toBe(1)
    expect(acc.lostCourseCount).toBe(0)
  })

  it('既知コース（prev>0）が0件化＋format-*有 → COURSE_LOST_ALL_ASSIGNMENTS', () => {
    const acc = createScanAccumulator()
    // course52 の HTML（format-* 有・logged_in）だが、抽出アンカー数を 0 として与える（描画崩れの模擬）。
    observeCoursePage(acc, { html: course52, modAnchorCount: 0, prevSignatureLen: 20 })
    expect(finalizeScanCodes(acc)).toContain('COURSE_LOST_ALL_ASSIGNMENTS')
    expect(acc.lostCourseCount).toBe(1)
  })

  it('初回（prev=null）は喪失判定しない', () => {
    const acc = createScanAccumulator()
    observeCoursePage(acc, { html: course52, modAnchorCount: 0, prevSignatureLen: null })
    expect(finalizeScanCodes(acc)).toEqual([])
    expect(acc.trackedCourseCount).toBe(0)
  })

  it('既知コースの過半が全課題喪失 → COURSES_MAJORITY_LOST（hard・横断集計）', () => {
    const acc = createScanAccumulator()
    // 3コース観測、うち2コースが format-* 有のまま全課題喪失（過半）。
    observeCoursePage(acc, { html: course52, modAnchorCount: 0, prevSignatureLen: 20 })
    observeCoursePage(acc, { html: course52, modAnchorCount: 0, prevSignatureLen: 12 })
    observeCoursePage(acc, { html: course52, modAnchorCount: 20, prevSignatureLen: 20 })
    const codes = finalizeScanCodes(acc)
    expect(acc.lostCourseCount).toBe(2)
    expect(acc.trackedCourseCount).toBe(3)
    expect(codes).toContain('COURSES_MAJORITY_LOST')
  })
})

describe('活動ページ診断（抽出フラグ経路）', () => {
  it('parseAssignmentPage が抽出フラグを返す（JA=全解決 / EN=キーワード有だが日付欠落）', () => {
    const ja = parseAssignmentPage(assign52Ja, `${BASE}/mod/assign/view.php?id=724`)
    expect(ja.keywordFound).toBe(true)
    expect(ja.dateParsed).toBe(true)
    expect(ja.statusResolved).toBe(true)

    const en = parseAssignmentPage(assign52En, `${BASE}/mod/assign/view.php?id=724`)
    expect(en.keywordFound).toBe(true)
    expect(en.dateParsed).toBe(false)
    expect(en.statusResolved).toBe(false)
  })

  it('EN 課題（Due有・日付書式非対応）→ DEADLINE_KEYWORD_NO_DATE', () => {
    const url = `${BASE}/mod/assign/view.php?id=724`
    const en = parseAssignmentPage(assign52En, url)
    const acc = createScanAccumulator()
    observeActivityPage(acc, {
      html: assign52En,
      url,
      keywordFound: en.keywordFound,
      dateParsed: en.dateParsed,
      statusResolved: en.statusResolved,
    })
    expect(finalizeScanCodes(acc)).toContain('DEADLINE_KEYWORD_NO_DATE')
  })

  it('JA 課題（全解決）は発火しない（健全）', () => {
    const url = `${BASE}/mod/assign/view.php?id=724`
    const ja = parseAssignmentPage(assign52Ja, url)
    const acc = createScanAccumulator()
    observeActivityPage(acc, {
      html: assign52Ja,
      url,
      keywordFound: ja.keywordFound,
      dateParsed: ja.dateParsed,
      statusResolved: ja.statusResolved,
    })
    expect(finalizeScanCodes(acc)).toEqual([])
  })
})

describe('サイクル貫通とゲート', () => {
  it('logged_out ページは LOGGED_OUT のみ集約する（他コードと共発火しない）', () => {
    const acc = createScanAccumulator()
    observeDashboard(acc, { html: '<input type="password">', courseAnchorCount: 0, knownCourseCount: 5 })
    expect(finalizeScanCodes(acc)).toEqual(['LOGGED_OUT'])
    expect(acc.reachedLetus).toBe(true)
  })

  it('非Moodleページ（M.cfg無・password無）は NOT_A_MOODLE_PAGE を集約するが reachedLetus=false', () => {
    // 認証fetch自体は成功しているので authProbe は NOT_A_MOODLE_PAGE を返すが、logged_in/logged_out の
    // 結論が付かない（多くは SSO 中間/リダイレクト過渡の偽陽性）。よって reachedLetus は立てず、
    // 記録側（recordScanCycleOutcome）が中立スキップする＝過渡ページで「読めない」を鳴らさない（原則3）。
    const acc = createScanAccumulator()
    observeDashboard(acc, { html: '<body>portal</body>', courseAnchorCount: 0, knownCourseCount: 5 })
    observeCoursePage(acc, { html: '<body>portal</body>', modAnchorCount: 0, prevSignatureLen: 20 })
    expect(acc.reachedLetus).toBe(false)
    expect(finalizeScanCodes(acc)).toEqual(['NOT_A_MOODLE_PAGE'])
  })
})
