/**
 * CLASS教務シラバス（静的HTML・charset=UTF-8）の純粋パーサー。
 * 構造: `.syllabusArea` 内に `.rowStyle` 行が並び、各行は「ラベル(.colHeader)＋値(.colStyle)」の
 * ペア（1行に2ペアのこともある）。値は入れ子 `<div>` に入り `<br>` で改行される。ラベルのみの行は
 * セクション見出し（例: 教科書）。全ペアを文書順に取り出せば概要・到達目標・成績評価・授業計画まで
 * 自然に並ぶ。ネイティブUIはこの {label, value} 列をそのまま描画する。
 */
import { decodeHtmlEntities } from './text'

export interface SyllabusRow {
  label: string
  value: string
}

export interface ParsedSyllabus {
  title: string
  rows: SyllabusRow[]
}

function cleanValue(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
  const noTags = withBreaks.replace(/<[^>]*>/g, '')
  return decodeHtmlEntities(noTags)
    .split('\n')
    .map((l) => l.replace(/[ \t　]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanLabel(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

export function parseSyllabus(html: string): ParsedSyllabus {
  const tokens: { pos: number; type: 'label' | 'value'; text: string }[] = []

  const labelRe = /<div class="colHeader colStyle colBorder"[^>]*>([\s\S]*?)<\/div>/g
  let m: RegExpExecArray | null
  while ((m = labelRe.exec(html)) !== null) {
    tokens.push({ pos: m.index, type: 'label', text: cleanLabel(m[1]) })
  }
  // 値は colHeader を含まない colStyle 行の入れ子 <div>。ラベル(class="colHeader colStyle …")とは
  // 属性の先頭が異なるため衝突しない。
  const valueRe = /<div class="colStyle colBorder"[^>]*>\s*<div>([\s\S]*?)<\/div>/g
  while ((m = valueRe.exec(html)) !== null) {
    tokens.push({ pos: m.index, type: 'value', text: cleanValue(m[1]) })
  }
  tokens.sort((a, b) => a.pos - b.pos)

  const rows: SyllabusRow[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'label') continue
    const label = tokens[i].text
    if (!label) continue
    const next = tokens[i + 1]
    if (next && next.type === 'value') {
      rows.push({ label, value: next.text })
      i++
    } else {
      rows.push({ label, value: '' })
    }
  }

  let title = ''
  const titleMatch = html.match(/<title>\s*([\s\S]*?)\s*<\/title>/i)
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]*>/g, ''))
      .replace(/\s+/g, ' ')
      .replace(/[｜|].*$/, '')
      .trim()
  }
  const nameRow = rows.find((r) => r.label.includes('科目授業名称（和文）'))
  if (nameRow?.value) title = nameRow.value

  return { title, rows }
}
