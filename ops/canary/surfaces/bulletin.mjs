import { open } from '../lib/browser.mjs'
import { bulletinSignal } from '../lib/signals.mjs'

const URL = 'https://class.admin.tus.ac.jp/uprx/up/bs/bsd007/Bsd00701.xhtml'

export async function probe(ctx, litus) {
  const { html, url } = await open(ctx, URL)
  return { surface: 'bulletin', health: bulletinSignal(html, url, litus), html }
}
