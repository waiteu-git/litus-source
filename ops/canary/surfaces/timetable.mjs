import { open } from '../lib/browser.mjs'
import { timetableSignal } from '../lib/signals.mjs'

const URL = 'https://class.admin.tus.ac.jp/uprx/up/bs/bsa001/Bsa00101.xhtml'

export async function probe(ctx, litus) {
  const { html, url } = await open(ctx, URL)
  return { surface: 'timetable', health: timetableSignal(html, url, litus), html }
}
