// storageState を作る手動キャプチャ（headed）。ディスプレイのあるデスクトップで実行する。
// 利用者が CLASS/LETUS を手動ログイン（ID/パスワード/MFA/KMSI）し、Enter で cookie を書き出す。
// このスクリプトは資格情報を一切受け取らない・保持しない（ブラウザ内で利用者が入力する）。
import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'

const OUT = process.env.STORAGE_STATE || join(homedir(), 'ops', 'storageState.json')
mkdirSync(dirname(OUT), { recursive: true }) // ~/ops が無くても保存できるように

const browser = await chromium.launch({ headless: false })
const ctx = await browser.newContext({ locale: 'ja-JP' })
const page = await ctx.newPage()

console.log('CLASS と LETUS の両方に手動でログインしてください（MFA/KMSI 含む）。')
console.log('  CLASS : https://class.admin.tus.ac.jp/uprx/up/bs/bsd007/Bsd00701.xhtml')
console.log('  LETUS : https://letus.ed.tus.ac.jp/my/courses.php')
await page.goto('https://class.admin.tus.ac.jp/uprx/up/bs/bsd007/Bsd00701.xhtml').catch(() => {})

const rl = createInterface({ input: process.stdin, output: process.stdout })
await new Promise((res) =>
  rl.question('\n両方ログインし、各トップページが見えたら Enter を押す... ', res),
)
rl.close()

await ctx.storageState({ path: OUT })
console.log(`saved: ${OUT}`)
console.log('この storageState.json を pi の ~/ops/ へコピーしてください（scp 等）。')
await browser.close()
