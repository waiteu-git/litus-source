/**
 * LETUSコースページから課題らしいリンクを検出する純粋パーサー。
 * WebViewのJS注入でコースページのHTMLを取り出し、どのリンクが課題/小テスト等かを判定する。
 *
 * 出典: ルート拡張機能 src/background/index.ts の候補検出ロジックを app/ へ移植（挙動等価）。
 */

import { normalizeText, stripTags, decodeHtmlEntities } from './text'

export type ScanLevel = 'strict' | 'standard' | 'broad'

export type CourseLink = { title: string; url: string }

/**
 * アンカーを抽出し、baseUrlで絶対URL化、フラグメント除去、タイトル空は除外。
 *
 * **same-host フィルタ（必須）**: 抽出したURLは後段で
 * ①非表示WebView（Cookie共有）にそのまま読み込まれ（AssignmentCollector / CourseUpdateEngine /
 * LetusPageFetcher）、②課題としてタップで可視WebViewに開かれる。よって「コースページのHTMLに
 * 書ける者」＝コース編集権限者やLETUS側のXSSが、任意ホストへの自動アクセスをアプリに行わせられる。
 * baseUrl（取得元ページ）と同一ホストのhttp(s)リンクだけを通してこの経路を塞ぐ。
 * `javascript:` / `data:` 等のスキームも同時に落ちる。
 * 同型の指摘はLTW `src/core/letusLinks.ts` で先に修正済み（2026-07-23）。
 *
 * baseUrl が解釈不能なら**何も返さない**（fail-closed）。基準が無い状態で検証はできないため。
 */
export function extractLinksFromHtml(html: string, baseUrl: string): CourseLink[] {
  const links: CourseLink[] = []
  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  let baseHost: string
  try {
    baseHost = new URL(baseUrl).host
  } catch {
    return links
  }
  if (!baseHost) return links

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1]
    const innerHtml = match[2]

    if (!href) continue

    try {
      const u = new URL(href, baseUrl)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue
      if (u.host !== baseHost) continue
      const url = u.toString().split('#')[0]
      const title = decodeHtmlEntities(stripTags(innerHtml))
      if (title.length > 0) {
        links.push({ title, url })
      }
    } catch {
      // URL変換失敗は無視
    }
  }

  return links
}

export function isTargetActivityUrl(url: string, scanLevel: ScanLevel): boolean {
  const normalizedUrl = url.toLowerCase()

  const strictModulePaths = [
    '/mod/assign/view.php',
    '/mod/quiz/view.php',
    '/mod/turnitintool/view.php',
    '/mod/turnitintooltwo/view.php',
  ]

  const standardModulePaths = [
    ...strictModulePaths,
    '/mod/workshop/view.php',
    '/mod/feedback/view.php',
    '/mod/choice/view.php',
    '/mod/questionnaire/view.php',
    '/mod/lti/view.php',
  ]

  const broadModulePaths = [
    ...standardModulePaths,
    '/mod/forum/view.php',
    '/mod/survey/view.php',
    '/mod/lesson/view.php',
  ]

  if (scanLevel === 'strict') {
    return strictModulePaths.some((path) => normalizedUrl.includes(path))
  }
  if (scanLevel === 'broad') {
    return broadModulePaths.some((path) => normalizedUrl.includes(path))
  }
  return standardModulePaths.some((path) => normalizedUrl.includes(path))
}

export function isClearlyNonAssignmentUrl(url: string): boolean {
  const normalizedUrl = url.toLowerCase()
  const excludedPaths = [
    '/grade/',
    '/grade/report/',
    '/reportbuilder/',
    '/user/',
    '/calendar/',
    '/message/',
    '/blog/',
    '/badges/',
    '/competency/',
    '/course/report/',
    '/course/view.php',
    '/mod/resource/',
    '/mod/folder/',
    '/mod/page/',
    '/mod/url/',
    '/mod/book/',
    '/mod/label/',
    '/mod/glossary/',
    '/mod/wiki/',
  ]
  return excludedPaths.some((path) => normalizedUrl.includes(path))
}

export function hasAssignmentKeyword(text: string, url: string): boolean {
  const normalizedText = normalizeText(text).toLowerCase()
  const normalizedUrl = url.toLowerCase()
  const keywords = [
    '課題', '提出', 'レポート', '小テスト', '確認テスト', 'テスト',
    'アンケート', '回答', '投稿',
    'assignment', 'assign', 'report', 'quiz', 'test',
    'questionnaire', 'feedback', 'workshop', 'turnitin',
  ]
  return keywords.some((keyword) => {
    const lowerKeyword = keyword.toLowerCase()
    return normalizedText.includes(lowerKeyword) || normalizedUrl.includes(lowerKeyword)
  })
}

export function isAssignmentLikeLink(text: string, url: string, scanLevel: ScanLevel): boolean {
  const normalizedText = normalizeText(text)
  if (normalizedText.length < 2 || normalizedText.length > 220) return false
  if (isClearlyNonAssignmentUrl(url)) return false
  if (isTargetActivityUrl(url, scanLevel)) return true
  if (scanLevel === 'broad') return hasAssignmentKeyword(normalizedText, url)
  return false
}

/** コースページHTMLから課題らしいリンクを抽出し、URLで重複排除して返す。 */
export function extractAssignmentLinks(
  html: string,
  baseUrl: string,
  scanLevel: ScanLevel,
): CourseLink[] {
  const links = extractLinksFromHtml(html, baseUrl)
  const seen = new Set<string>()
  const result: CourseLink[] = []
  for (const link of links) {
    if (!isAssignmentLikeLink(link.title, link.url, scanLevel)) continue
    if (seen.has(link.url)) continue
    seen.add(link.url)
    result.push(link)
  }
  return result
}
