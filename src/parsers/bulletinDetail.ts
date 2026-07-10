import { parse, type HTMLElement } from 'node-html-parser'

/** 掲示内容モーダル(bsd00702)から抽出した本文情報。 */
export type BulletinBody = {
  from: string
  category: string
  subject: string
  text: string
  period: string
  hasAttachment: boolean
}

/** セル内テキストを1行に正規化（&nbsp;→空白、連続空白を1つに）。 */
function plainText(el: HTMLElement): string {
  return (el.text ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}

/** 本文セル。<br> を改行に変換し、リッチHTMLをプレーンテキスト化（改行保持）。 */
function bodyText(el: HTMLElement): string {
  const withBreaks = el.innerHTML.replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
  const t = parse(withBreaks).text
  return t
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 掲示内容モーダルのHTML（#bsd00702:dialogPanel の innerHTML 等）から本文情報を抽出する（純粋・RN非依存）。
 * table.singleTable の各行は「ヘッダラベル(差出人/カテゴリ/件名/本文/掲示期間) → 値セル」の対。
 * 本文セルは .fr-view のリッチHTMLで、<br> を改行に変換して取り込む。添付は「添付資料」ボタンで検知。
 * テーブルが見つからなければ（未描画等）null。
 */
export function parseBulletinDetail(html: string): BulletinBody | null {
  const root = parse(html)
  const table = root.querySelector('table.singleTable') ?? root.querySelector('.ui-panelgrid')
  if (!table) return null
  const map: Record<string, HTMLElement> = {}
  for (const tr of table.querySelectorAll('tr')) {
    const cells = tr.querySelectorAll('td')
    if (cells.length < 2) continue
    const label = plainText(cells[0])
    if (label) map[label] = cells[cells.length - 1]
  }
  const get = (k: string) => (map[k] ? plainText(map[k]) : '')
  const bodyCell = map['本文']
  const hasAttachment = root
    .querySelectorAll('.ui-button-text')
    .some((b) => (b.text ?? '').includes('添付資料'))
  return {
    from: get('差出人'),
    category: get('カテゴリ'),
    subject: get('件名'),
    text: bodyCell ? bodyText(bodyCell) : '',
    period: get('掲示期間'),
    hasAttachment,
  }
}
