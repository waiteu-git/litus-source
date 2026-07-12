import { parse } from 'node-html-parser'
import { richHtmlToText } from './text'

export type LetusAttachment = { name: string; url: string }
export type AssignBody = { description: string; attachments: LetusAttachment[] }

/**
 * LETUS課題ページ(mod/assign/view.php)のHTMLから説明本文と添付を抽出する純粋パーサ。
 * 締切・提出状況は parseAssignmentPage(letus.ts) の担当。ここは本文・添付に限定する。
 * intro が見つからなければ description='' を返し、画面側でWebViewフォールバックさせる。
 */
export function parseAssignBody(html: string): AssignBody {
  const root = parse(html)
  const main =
    root.querySelector('[role="main"]') ?? root.querySelector('#region-main') ?? root

  const introEl =
    main.querySelector('#intro') ??
    main.querySelector('.activity-description') ??
    main.querySelector('.box.generalbox')
  // richHtmlToText は行末の空白しか畳まないため、Moodle側のpretty-print由来の
  // 行頭インデントを追加で除去する（改行構造自体はrichHtmlToTextの結果を尊重）。
  const description = introEl
    ? richHtmlToText(introEl.innerHTML)
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .trim()
    : ''

  const attachments: LetusAttachment[] = []
  const seen = new Set<string>()
  for (const a of main.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? ''
    if (!/\/pluginfile\.php\//i.test(href)) continue
    if (seen.has(href)) continue
    seen.add(href)
    const text = (a.text ?? '').replace(/\s+/g, ' ').trim()
    let name = text
    if (!name) {
      const last = href.split('/').pop() ?? ''
      name = decodeURIComponent(last.split('?')[0]) || 'ファイル'
    }
    attachments.push({ name, url: href })
  }

  return { description, attachments }
}
