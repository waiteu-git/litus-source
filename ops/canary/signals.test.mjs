import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadLitus } from './lib/load.mjs'
import {
  bulletinSignal,
  timetableSignal,
  letusPageStat,
  letusRunHealth,
  attendanceSignal,
} from './lib/signals.mjs'

const litus = await loadLitus()
// litus src の実 fixture を直接読む（vendor コピー不要）。
const fx = (p) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8')

const B_URL = 'https://class.admin.tus.ac.jp/uprx/up/bs/bsd007/Bsd00701.xhtml'
const TT_URL = 'https://class.admin.tus.ac.jp/uprx/up/bs/bsa001/Bsa00101.xhtml'
const A_URL = 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1'
const AT_URL = 'https://class.admin.tus.ac.jp/uprx/up/xu/xua001/Xua00101.xhtml'

// --- 掲示 ---
test('bulletin real fixture -> ok with count', () => {
  const h = bulletinSignal(fx('parsers/__fixtures__/bulletin-real.html'), B_URL, litus)
  assert.equal(h.status, 'ok')
  assert.ok(h.count > 0)
})
test('bulletin container removed -> structure_drift', () => {
  const stripped =
    fx('parsers/__fixtures__/bulletin-real.html').replace(/<dl[^>]*keiji[^>]*>[\s\S]*?<\/dl>/g, '') +
    '<a href="/logout">ログアウト</a>' +
    'x'.repeat(400)
  const h = bulletinSignal(stripped, B_URL, litus)
  assert.equal(h.status, 'structure_drift')
})

// --- 時間割 ---
test('timetable real fixture -> ok', () => {
  const h = timetableSignal(fx('parsers/__fixtures__/timetable-real.html'), TT_URL, litus)
  assert.equal(h.status, 'ok')
})

// --- LETUS課題 ---
test('letus assign fixture -> parsedOk', () => {
  const s = letusPageStat(fx('parsers/__fixtures__/assign-not-submitted-real.html'), A_URL, litus)
  assert.equal(s.loginSeen, false)
  assert.equal(s.parsedOk, true)
})
test('letus run: 3 visited 0 parsed -> structure_drift', () => {
  const h = letusRunHealth({ visited: 3, parsedOk: 0, loginSeen: false }, litus)
  assert.equal(h.status, 'structure_drift')
})
test('letus login marker -> loginSeen', () => {
  const s = letusPageStat('<input type="password" name="password">', A_URL, litus)
  assert.equal(s.loginSeen, true)
})

// --- 出席 ---
test('attendance accepting fixture -> ok', () => {
  const h = attendanceSignal(fx('collect/__fixtures__/attendance-accepting-real.html'), AT_URL, litus)
  assert.equal(h.status, 'ok')
})
test('attendance login page -> not_logged_in', () => {
  const h = attendanceSignal('<input type="password">' + 'x'.repeat(400), AT_URL, litus)
  assert.equal(h.status, 'not_logged_in')
})
// 空storageStateのSSOログインページ着地: URLが非目的(microsoftonline)で紛れの
// logout文字列によりloggedIn=true・password欄なし。兄弟面(bulletin/timetable)は
// offTargetでblockedになる。attendanceも同じくblockedに落ちること（旧: 誤ってstructure_drift）。
test('attendance SSO login page (off-target url, stray logout, no password) -> blocked', () => {
  const html = '<a href="/logout">logout</a>' + 'x'.repeat(400)
  const h = attendanceSignal(html, 'https://login.microsoftonline.com/common/oauth2/authorize', litus)
  assert.equal(h.status, 'blocked')
})
// 過剰マスク防止: ログイン済・非off-targetの実CLASSページで出席モジュール痕跡が皆無なら
// 従来通りstructure_drift（offTargetガード追加が真のdriftを潰さないことの担保）。
test('attendance logged-in real page without attendance markers -> structure_drift', () => {
  const html = '<a>ログアウト</a>' + 'y'.repeat(400)
  const h = attendanceSignal(html, 'https://class.admin.tus.ac.jp/uprx/up/xx/yy/Yy00101.xhtml', litus)
  assert.equal(h.status, 'structure_drift')
})
