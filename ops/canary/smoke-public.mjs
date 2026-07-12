// 資格情報不要の疎通スモーク。LETUS の公開ログインページ（Stage A も毎日叩く読み取り専用GET）を
// 実 headless chromium で開き、「browser → page.content() → litus 判定(hasLetusLoginMarker)」の
// パイプラインが実 TUS に対して動くことを確認する。認証後のナビゲーションは storageState 必須の
// ため対象外（ここでは検証しない）。exit 0=OK / 1=想定マーカー不在(DOM変更かネット不通の疑い)。
import { chromium } from 'playwright'
import { loadLitus } from './lib/load.mjs'

const URL = 'https://letus.ed.tus.ac.jp/login/index.php'
const litus = await loadLitus()

const browser = await chromium.launch({ headless: true })
let ok = false
try {
  const ctx = await browser.newContext({ locale: 'ja-JP' })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const html = await page.content()
  const marker = litus.hasLetusLoginMarker(html)
  console.log(`[smoke] ${URL}`)
  console.log(`[smoke] bytes=${html.length} hasLetusLoginMarker=${marker}`)
  ok = marker
} finally {
  await browser.close()
}
console.log(ok ? '[smoke] OK: 実TUSへのパイプライン疎通を確認' : '[smoke] FAIL: 想定マーカー不在')
process.exit(ok ? 0 : 1)
