// litus-canary Stage B エントリ。4面を読み取り専用巡回し、structure_drift/not_logged_in を
// #ops-alerts へ通知、drift は生HTMLを fixture 保存する。メンテ帯は誤検知防止のため skip。
//
// メンテ帯判定(maintenanceWindow.ts)は getHours() のローカル時刻を使うため、pi の
// システムTZ に依存しないよう最初の Date 生成前に JST を強制する（UTC運用でも誤判定しない）。
process.env.TZ = 'Asia/Tokyo'

import { loadLitus } from './lib/load.mjs'
import { withBrowser } from './lib/browser.mjs'
import { loadEnv } from './lib/env.mjs'
import { notifyDiscord } from './lib/notify.mjs'
import { saveFixture } from './lib/fixtures.mjs'
import { probe as bulletin } from './surfaces/bulletin.mjs'
import { probe as timetable } from './surfaces/timetable.mjs'
import { probe as letus } from './surfaces/letus.mjs'
import { probe as attendance } from './surfaces/attendance.mjs'

const NOW = new Date()
const env = loadEnv()
const litus = await loadLitus()

// メンテ帯ガード（CLASS 2:00–4:00 / LETUS 4:00–5:30・誤検知防止）
const maint = litus.maintenanceSystemAt(NOW)
if (maint) {
  console.log(`[canary] maintenance window (${maint}); skip`)
  process.exit(0)
}

const probes = [
  ['bulletin', bulletin],
  ['timetable', timetable],
  ['attendance', attendance],
  ['letus', letus],
]
const results = []
await withBrowser(async (ctx) => {
  for (const [name, p] of probes) {
    try {
      results.push(await p(ctx, litus))
    } catch (e) {
      results.push({ surface: name, health: { status: 'blocked' }, html: '', error: e.message })
    }
  }
})

const lines = []
let drift = 0
let notLoggedIn = 0
for (const r of results) {
  const st = r.health.status
  if (st === 'structure_drift') {
    drift++
    const path = saveFixture(r.surface, r.html || '', NOW)
    lines.push(`- 🧬 ${r.surface}: structure_drift（fixture: ${path}）`)
  } else if (st === 'not_logged_in') {
    notLoggedIn++
    lines.push(`- 🔑 ${r.surface}: not_logged_in`)
  } else if (st === 'blocked') {
    lines.push(`- ⚠️ ${r.surface}: blocked${r.error ? ' (' + r.error + ')' : ''}`)
  } else {
    console.log(`[canary] ${r.surface}: ${st}${r.health.count ? ' (' + r.health.count + ')' : ''}`)
  }
}

if (drift > 0 || notLoggedIn > 0) {
  const head =
    notLoggedIn > 0 && drift === 0
      ? '🥬🔑 Litusカナリア: storageState 失効の可能性。デスクトップで capture-login し直して pi へコピーしてください。'
      : '🥬❌ Litusカナリア: 構造driftを検知。litus パーサ修正が必要です。'
  await notifyDiscord(env.OPS_WEBHOOK_URL, `${head}\n${lines.join('\n')}`)
  process.exit(drift > 0 ? 2 : 3)
}
if (lines.length > 0) {
  // 一時的 blocked のみ: 通知せずログに残す（頻発時のみ後日しきい値化する）。
  console.log('[canary] transient:\n' + lines.join('\n'))
}
// 週次ハートビート（日曜）: 沈黙が「正常」か「死」かを曖昧にしない。
if (NOW.getDay() === 0) {
  await notifyDiscord(env.OPS_WEBHOOK_URL, '🥬✅ Litusカナリア: 週次ハートビート。4面すべて健全。')
}
console.log('[canary] done')
