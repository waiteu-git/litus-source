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
import { buildBannerContent } from './diagnosticsBannerContent'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')
const BASE = 'https://letus.ed.tus.ac.jp'

const my52 = read('../parsers/__fixtures__/moodle52/my52_raw.html')
const my52Hydrated = read('../parsers/__fixtures__/moodle52/my52_hydrated.html')
// my52_hydrated は school.moodledemo.net で実採取した DOM（アンカーが絶対URL）なので、
// コース抽出の origin はその採取元を渡す（LETUS origin では 0 件になる）。
const SANDBOX = 'https://school.moodledemo.net'
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
  it('parseAssignmentPage が抽出フラグを返す（JA/EN とも全解決＝T7 で英語書式に対応済み）', () => {
    const ja = parseAssignmentPage(assign52Ja, `${BASE}/mod/assign/view.php?id=724`)
    expect(ja.keywordFound).toBe(true)
    expect(ja.dateParsed).toBe(true)
    expect(ja.statusResolved).toBe(true)

    // T7 で英語 %B 書式("Tuesday, 12 December 2023, 12:00 AM")と "No submissions have been made"
    // に対応したため、EN も JA 同様に締切・状態とも解決する（旧: dateParsed/statusResolved=false）。
    const en = parseAssignmentPage(assign52En, `${BASE}/mod/assign/view.php?id=724`)
    expect(en.keywordFound).toBe(true)
    expect(en.dateParsed).toBe(true)
    expect(en.statusResolved).toBe(true)
  })

  it('締切キーワード有・日付パース不能 → DEADLINE_KEYWORD_NO_DATE（真の書式破損の代表）', () => {
    // 実 EN fixture は T7 で解決できるようになったため、この診断コードは「本当に日付が読めない」
    // 合成ページ（キーワードは在るが日付が数値化不能）で固定する＝将来の日付書式破損の検出保証。
    const url = `${BASE}/mod/assign/view.php?id=724`
    const brokenDateHtml =
      '<html><head><script>var M={};M.cfg={wwwroot:"https://letus.ed.tus.ac.jp"};</script></head>' +
      '<body><div id="intro">提出期限：追って連絡します（日時未定）</div>' +
      '<div>まだ提出されていません。</div></body></html>'
    const parsed = parseAssignmentPage(brokenDateHtml, url)
    expect(parsed.keywordFound).toBe(true)
    expect(parsed.dateParsed).toBe(false)
    const acc = createScanAccumulator()
    observeActivityPage(acc, {
      html: brokenDateHtml,
      url,
      keywordFound: parsed.keywordFound,
      dateParsed: parsed.dateParsed,
      statusResolved: parsed.statusResolved,
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

  it('SSO中間ページ→再試行成功のサイクルは LOGGED_OUT を残さない', () => {
    // LetusSyncEngine の courses ステージは「空振り（SSOリダイレクト途中）→WebView作り直して再試行」を
    // 設計として持つ（COURSES_MAX_TRIES）。1回目の着地は IdP のログインページなので logged_out と
    // 分類されるが、2回目で SSO が完走して同じ面が正常に読める。セッションは一度も切れていない。
    const acc = createScanAccumulator()
    observeDashboard(acc, { html: '<input type="password">', courseAnchorCount: 0, knownCourseCount: 5 })
    observeDashboard(acc, {
      html: my52Hydrated,
      courseAnchorCount: parseMyCourses(my52Hydrated, SANDBOX).length,
      knownCourseCount: 5,
    })
    expect(finalizeScanCodes(acc)).toEqual([])
  })

  it('ハイドレーション未完→再試行成功のサイクルは DASHBOARD_UNREADABLE を残さない', () => {
    // LOGGED_OUT と同型の「同一面の再観測」経路。courses ステージの再試行では、1回目が
    // ログインページでなく「ログイン済みだがまだ描画が終わっていない Dashboard」に着地することもある
    // （5.x のクライアント描画・T5 の待ち機構が取りこぼした場合）。2回目で全コースが読めているなら
    // この面は健全なので、1回目の判定を引きずってはいけない。
    const acc = createScanAccumulator()
    observeDashboard(acc, { html: my52, courseAnchorCount: 0, knownCourseCount: 5 })
    observeDashboard(acc, {
      html: my52Hydrated,
      courseAnchorCount: parseMyCourses(my52Hydrated, SANDBOX).length,
      knownCourseCount: 5,
    })
    expect(finalizeScanCodes(acc)).toEqual([])
  })

  it('再観測しても最後の Dashboard が壊れていれば DASHBOARD_UNREADABLE は残る', () => {
    // 上の打ち消しが「常に消す」に倒れていないことの固定（本当の破損を握り潰さない）。
    const acc = createScanAccumulator()
    observeDashboard(acc, {
      html: my52Hydrated,
      courseAnchorCount: parseMyCourses(my52Hydrated, SANDBOX).length,
      knownCourseCount: 5,
    })
    observeDashboard(acc, { html: my52, courseAnchorCount: 0, knownCourseCount: 5 })
    expect(finalizeScanCodes(acc)).toEqual(['DASHBOARD_UNREADABLE'])
  })

  it('サイクル途中の logged_out 観測は、同サイクルに logged_in 観測があれば警告バナーを出さない', () => {
    // 症状の end-to-end 再現: 収集自体は成功しているのに「LETUSからログアウトされています」が出る。
    // LOGGED_OUT は閾値を待たず即 active になるため、過渡的な1ページの誤観測がそのままバナーになる。
    const acc = createScanAccumulator()
    observeDashboard(acc, {
      html: my52Hydrated,
      courseAnchorCount: parseMyCourses(my52Hydrated, SANDBOX).length,
      knownCourseCount: 5,
    })
    // 活動ページ巡回の途中で1本だけ SSO 中間ページを踏む（他の活動ページは正常）。
    observeActivityPage(acc, {
      html: '<input type="password">',
      url: `${BASE}/mod/assign/view.php?id=1`,
      keywordFound: false,
      dateParsed: false,
      statusResolved: false,
    })
    const state = applyScanOutcome(null, { codes: finalizeScanCodes(acc), at: '2026-08-12T10:00:00.000Z' })
    expect(state.activeCodes).toEqual([])
    expect(buildBannerContent(state).kind).toBe('none')
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

describe('受動版フィンガープリントの相乗り観測（§9・T8）', () => {
  /** Moodle 標準フッタの docs リンク（実 fixture のトリムで落ちている部分の復元）。 */
  const docsFooter = (segment: string) =>
    `<footer><a href="https://docs.moodle.org/${segment}/ja/x">このページのヘルプ</a></footer>`

  it('実 5.2 fixture そのままでは版が読めず null のまま（誤って BS5 を主張しない）', () => {
    const acc = createScanAccumulator()
    observeDashboard(acc, {
      html: my52,
      courseAnchorCount: parseMyCourses(my52, BASE).length,
      knownCourseCount: 0,
    })
    expect(acc.fingerprint).toBeNull()
  })

  it('logged_in ページから版を読む（5.2 → bs5=true）', () => {
    const acc = createScanAccumulator()
    observeDashboard(acc, {
      html: my52 + docsFooter('502'),
      courseAnchorCount: 0,
      knownCourseCount: 0,
    })
    expect(acc.fingerprint?.version).toEqual({ major: 5, minor: 2 })
    expect(acc.fingerprint?.bs5).toBe(true)
  })

  it('現行世代（4.5）を読んでも bs5=false＝BS5ノートの経路には乗らない', () => {
    const acc = createScanAccumulator()
    observeCoursePage(acc, {
      html: course52 + docsFooter('405'),
      modAnchorCount: 5,
      prevSignatureLen: 5,
    })
    expect(acc.fingerprint?.version).toEqual({ major: 4, minor: 5 })
    expect(acc.fingerprint?.bs5).toBe(false)
  })

  it('logged_out / unknown ページの docs リンクは採用しない（SSO・メンテ画面での誤記録防止）', () => {
    const loggedOut = createScanAccumulator()
    observeDashboard(loggedOut, {
      html: `<input type="password">${docsFooter('502')}`,
      courseAnchorCount: 0,
      knownCourseCount: 3,
    })
    expect(loggedOut.fingerprint).toBeNull()

    const unknown = createScanAccumulator()
    observeDashboard(unknown, {
      html: `<body>portal</body>${docsFooter('502')}`,
      courseAnchorCount: 0,
      knownCourseCount: 3,
    })
    expect(unknown.fingerprint).toBeNull()
  })

  it('サイクル内で最初に読めた観測を保持し、以降のページは走査しない', () => {
    const acc = createScanAccumulator()
    observeDashboard(acc, {
      html: my52 + docsFooter('405'),
      courseAnchorCount: 1,
      knownCourseCount: 1,
    })
    // 後続ページに別版のリンクがあっても上書きしない（同一サイクル内で稼働版は変わらない前提）。
    observeActivityPage(acc, {
      html: assign52Ja + docsFooter('502'),
      url: `${BASE}/mod/assign/view.php?id=724`,
      keywordFound: true,
      dateParsed: true,
      statusResolved: true,
    })
    expect(acc.fingerprint?.version).toEqual({ major: 4, minor: 5 })
  })

  it('版が読めるかどうかは診断コードの集約に影響しない（独立した観測）', () => {
    const withFp = createScanAccumulator()
    observeDashboard(withFp, {
      html: my52 + docsFooter('502'),
      courseAnchorCount: parseMyCourses(my52, BASE).length,
      knownCourseCount: 8,
    })
    const withoutFp = createScanAccumulator()
    observeDashboard(withoutFp, {
      html: my52,
      courseAnchorCount: parseMyCourses(my52, BASE).length,
      knownCourseCount: 8,
    })
    expect(finalizeScanCodes(withFp)).toEqual(finalizeScanCodes(withoutFp))
    expect(finalizeScanCodes(withFp)).toContain('DASHBOARD_UNREADABLE')
  })
})
