import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseBulletinList } from '../parsers/bulletin'
import { parseTimetable } from '../parsers/timetable'
import {
  attendanceStatsHealth,
  bulletinHealth,
  createHealthObservation,
  hasLetusLoginMarker,
  isKnownOffTargetPage,
  letusAssignmentsHealth,
  observePageSignal,
  timetableHealth,
  type HealthObservation,
} from './collectionSignals'

const BULLETIN_TABS = readFileSync(
  fileURLToPath(new URL('../parsers/__fixtures__/bulletin-tabs.html', import.meta.url)),
  'utf-8',
)
const TIMETABLE_REAL = readFileSync(
  fileURLToPath(new URL('../parsers/__fixtures__/timetable-real.html', import.meta.url)),
  'utf-8',
)

describe('observePageSignal', () => {
  it('pageシグナルからフラグを累積する（一度trueになったら保持）', () => {
    const o = createHealthObservation()
    observePageSignal(o, { type: 'page', hasPasswordInput: true, url: 'https://login.microsoftonline.com/x' })
    observePageSignal(o, { type: 'page', hasLogout: true, hasMaintenance: false, url: 'https://class.admin.tus.ac.jp/uprx/up/bs/bsd007/Bsd00701.xhtml' })
    expect(o.passwordSeen).toBe(true)
    expect(o.loggedIn).toBe(true)
    expect(o.lastUrl).toContain('Bsd00701')
  })

  it('page以外のtypeは無視する', () => {
    const o = createHealthObservation()
    observePageSignal(o, { type: 'bulletin', pwd: 1 })
    expect(o.passwordSeen).toBe(false)
  })
})

describe('bulletinHealth（実fixtureで固定）', () => {
  it('実DOM: dl.keiji多数＋パース成功 → ok', () => {
    const parsed = parseBulletinList(BULLETIN_TABS)
    expect(parsed.length).toBeGreaterThan(0) // fixture前提の確認
    const o = createHealthObservation()
    const h = bulletinHealth(o, { page: 'Bsd00701.xhtml', count: parsed.length, tab: 1, pwd: 0, logout: 1, blen: 5000 }, parsed.length)
    expect(h).toEqual({ status: 'ok', count: parsed.length })
  })

  it('行は在るのに1件も解析できない → structure_drift（行の内部構造変更）', () => {
    const o = createHealthObservation()
    const h = bulletinHealth(o, { page: 'Bsd00701.xhtml', count: 143, tab: 1, pwd: 0, logout: 1, blen: 5000 }, 0)
    expect(h).toEqual({ status: 'structure_drift' })
  })

  it('タブ構造は在って0件 → empty_valid', () => {
    const o = createHealthObservation()
    const h = bulletinHealth(o, { page: 'Bsd00701.xhtml', count: 0, tab: 1, pwd: 0, logout: 1, blen: 5000 }, 0)
    expect(h).toEqual({ status: 'empty_valid' })
  })

  it('掲示ページに着地したのにタブもdl.keijiも不在 → structure_drift', () => {
    const o = createHealthObservation()
    const h = bulletinHealth(o, { page: 'Bsd00701.xhtml', count: 0, tab: 0, pwd: 0, logout: 1, blen: 5000 }, 0)
    expect(h).toEqual({ status: 'structure_drift' })
  })

  it('掲示ページ以外に留まった（ポータル等）→ blocked', () => {
    const o = createHealthObservation()
    const h = bulletinHealth(o, { page: 'Xut12401.xhtml', count: 0, tab: 0, pwd: 0, logout: 1, blen: 5000 }, 0)
    expect(h).toEqual({ status: 'blocked' })
  })

  it('collectペイロード未着（タイムアウト）でも観測箱のメンテ観測を反映 → maintenance', () => {
    const o = createHealthObservation()
    observePageSignal(o, { type: 'page', hasMaintenance: true, url: 'https://class.admin.tus.ac.jp/' })
    expect(bulletinHealth(o, null, 0)).toEqual({ status: 'maintenance' })
  })
})

describe('timetableHealth（実fixtureで固定）', () => {
  it('実DOM: classTableあり＋slot解析成功 → ok', () => {
    const slots = parseTimetable(TIMETABLE_REAL)
    expect(slots.length).toBeGreaterThan(0)
    const o = createHealthObservation()
    const h = timetableHealth(o, { page: 'Kmh00601.xhtml', tableCount: 1, hasJigen: true, pwd: 0, logout: 1, blen: 5000 }, slots.length)
    expect(h).toEqual({ status: 'ok', count: slots.length })
  })

  it('classTableは在るのにslot 0件 → structure_drift（内部構造変更を優先検知）', () => {
    const o = createHealthObservation()
    const h = timetableHealth(o, { page: 'Kmh00601.xhtml', tableCount: 1, hasJigen: true, pwd: 0, logout: 1, blen: 5000 }, 0)
    expect(h).toEqual({ status: 'structure_drift' })
  })

  it('ポータルに留まった（メニュー遷移失敗）→ blocked', () => {
    const o = createHealthObservation()
    const h = timetableHealth(o, { page: 'Xut12401.xhtml', tableCount: 0, hasJigen: false, pwd: 0, logout: 1, blen: 5000 }, 0)
    expect(h).toEqual({ status: 'blocked' })
  })

  it('未知ページでログイン済・実質描画・コンテナ不在 → structure_drift', () => {
    const o = createHealthObservation()
    const h = timetableHealth(o, { page: 'Kmh00601.xhtml', tableCount: 0, hasJigen: false, pwd: 0, logout: 1, blen: 5000 }, 0)
    expect(h).toEqual({ status: 'structure_drift' })
  })
})

describe('isKnownOffTargetPage', () => {
  it.each([
    ['Xut12401.xhtml', true], // ログイン後ポータル
    ['https://class.admin.tus.ac.jp/', true], // 入口トップ
    ['https://login.microsoftonline.com/common/oauth2', true],
    ['', true], // 観測なし
    ['Bsd00701.xhtml', false],
    ['Kmh00601.xhtml', false],
  ])('%s → %s', (path, expected) => {
    expect(isKnownOffTargetPage(path)).toBe(expected)
  })
})

describe('letusAssignmentsHealth', () => {
  it('ログイン画面を踏んだ → not_logged_in', () => {
    expect(letusAssignmentsHealth({ visited: 5, parsedOk: 0, loginSeen: true })).toEqual({ status: 'not_logged_in' })
  })
  it('巡回候補0＝新着なしの正常 → empty_valid', () => {
    expect(letusAssignmentsHealth({ visited: 0, parsedOk: 0, loginSeen: false })).toEqual({ status: 'empty_valid' })
  })
  it('1件でも解析できた → ok', () => {
    expect(letusAssignmentsHealth({ visited: 4, parsedOk: 3, loginSeen: false })).toEqual({ status: 'ok', count: 3 })
  })
  it('3ページ以上巡回して全滅 → structure_drift', () => {
    expect(letusAssignmentsHealth({ visited: 3, parsedOk: 0, loginSeen: false })).toEqual({ status: 'structure_drift' })
  })
  it('1〜2ページの空振りは証拠不足 → blocked', () => {
    expect(letusAssignmentsHealth({ visited: 2, parsedOk: 0, loginSeen: false })).toEqual({ status: 'blocked' })
  })
})

describe('hasLetusLoginMarker', () => {
  it('password欄を含むHTML → true', () => {
    expect(hasLetusLoginMarker('<input type="password" name="passwd">')).toBe(true)
  })
  it('Microsoftログインへのリダイレクト断片 → true', () => {
    expect(hasLetusLoginMarker('<a href="https://login.microsoftonline.com/x">sign in</a>')).toBe(true)
  })
  it('通常の課題ページ → false', () => {
    expect(hasLetusLoginMarker('<div class="submissionstatustable">まだ提出されていません</div>')).toBe(false)
  })
})

describe('attendanceStatsHealth（出欠収集の健康記録＝授業中に取れない理由を残す）', () => {
  const obs = (over: Partial<HealthObservation> = {}): HealthObservation => ({
    ...createHealthObservation(),
    ...over,
  })

  it('科目が取れたら ok', () => {
    expect(attendanceStatsHealth(obs({ loggedIn: true }), { htmlLen: 500, rows: 12, blen: 900 }, 8)).toEqual({
      status: 'ok',
      count: 8,
    })
  })
  it('多重画面競合（PC等と競合）は blocked＝授業中に取れない典型の理由が残る', () => {
    expect(attendanceStatsHealth(obs({ conflictSeen: true }), { htmlLen: 0, rows: 0, blen: 400 }, 0)).toEqual({
      status: 'blocked',
    })
  })
  it('表は在るのに1件も解析できない＝structure_drift（DOM変更の疑い）', () => {
    expect(attendanceStatsHealth(obs({ loggedIn: true }), { htmlLen: 500, rows: 12, blen: 900 }, 0)).toEqual({
      status: 'structure_drift',
    })
  })
  it('表は在って行0＝本当に0件（empty_valid）', () => {
    expect(attendanceStatsHealth(obs({ loggedIn: true }), { htmlLen: 120, rows: 0, blen: 900 }, 0)).toEqual({
      status: 'empty_valid',
    })
  })
  it('未着地（出欠ページに辿り着けない）は blocked', () => {
    expect(attendanceStatsHealth(obs({ lastUrl: 'Xut11301.xhtml' }), null, 0)).toEqual({ status: 'blocked' })
  })
  it('ログイン画面に落ちたら not_logged_in', () => {
    expect(attendanceStatsHealth(obs({ passwordSeen: true }), { htmlLen: 0, rows: 0, pwd: 1, blen: 400 }, 0)).toEqual({
      status: 'not_logged_in',
    })
  })
})
