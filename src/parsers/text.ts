/**
 * HTML/テキスト整形の共有ユーティリティ（純粋関数）。
 * LETUS課題パーサー（letus.ts）とリンク検出（letusLinks.ts）の両方から使う。
 * 出典: ルート拡張機能 src/background/index.ts の純粋関数群。
 */

import { parse } from 'node-html-parser'

export function normalizeText(text: unknown): string {
  return String(text ?? '').trim().replace(/\s+/g, ' ')
}

export function stripTags(html: string): string {
  return normalizeText(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' '),
  )
}

export function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  }
  return String(text).replace(
    /&(amp|lt|gt|quot|#39|nbsp);/g,
    (match) => entities[match] ?? match,
  )
}

/** HTMLをテキストに変換する。ブロック要素は改行、script/styleは除去、エンティティは復号。 */
export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    stripTags(
      String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/th>/gi, ' ')
        .replace(/<\/td>/gi, ' '),
    ),
  )
}

/**
 * 要素のリッチHTML（innerHTML文字列）を改行保持のプレーンテキストにする。
 * <br>を改行に、&nbsp;を空白に。掲示本文(.fr-view)とLETUS課題本文(#intro)で共有する。
 */
export function richHtmlToText(innerHtml: string): string {
  const withBreaks = String(innerHtml).replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
  const t = parse(withBreaks).text
  return t
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
