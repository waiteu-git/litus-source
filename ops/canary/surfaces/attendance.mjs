import { open } from '../lib/browser.mjs'
import { attendanceSignal } from '../lib/signals.mjs'

const URL = 'https://class.admin.tus.ac.jp/uprx/up/xu/xua001/Xua00101.xhtml'

export async function probe(ctx, litus) {
  const { html, url } = await open(ctx, URL)
  return { surface: 'attendance', health: attendanceSignal(html, url, litus), html }
}
