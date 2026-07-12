// headless chromium を storageState 付きで起動し、URL を開いて生HTMLを返す。
// 実ブラウザUA・低頻度で「静かに運用」。書き込みは一切行わない（読み取り専用）。
import { chromium } from 'playwright'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export async function withBrowser(fn) {
  const statePath = process.env.STORAGE_STATE || join(homedir(), 'ops', 'storageState.json')
  if (!existsSync(statePath)) {
    throw new Error(`storageState not found: ${statePath}（capture-login.mjs で作成し pi へコピー）`)
  }
  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({ storageState: statePath, userAgent: UA, locale: 'ja-JP' })
    return await fn(ctx)
  } finally {
    await browser.close()
  }
}

export async function open(ctx, url, { waitMs = 2500 } = {}) {
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(waitMs)
    const html = await page.content()
    return { html, url: page.url(), bodyLen: html.length }
  } finally {
    await page.close()
  }
}
