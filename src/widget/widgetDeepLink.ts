/**
 * ウィジェットのタップ導線で使う litus:// ディープリンクの解析（純関数・RN 非依存・vitest 対象）。
 * ウィジェット側は clickAction='OPEN_URI' で litus://... を投げ、OS がアプリを起動する。
 * アプリは Linking で受けた URL をこの純関数で解釈し、navigationRef の request* を呼ぶ（widgetLinking.ts）。
 *
 * 対応: litus://attendance / litus://timetable / litus://home /
 *       litus://assignment?url=<encodeURIComponent した課題ページURL>
 */
export type WidgetRoute =
  | { kind: 'attendance' }
  | { kind: 'timetable' }
  | { kind: 'home' }
  | { kind: 'assignment'; url: string }

export function parseWidgetUrl(url: string | null | undefined): WidgetRoute | null {
  if (!url) return null
  const m = url.match(/^litus:\/\/([a-z]+)(?:\?(.*))?$/)
  if (!m) return null
  const host = m[1]
  const query = m[2] ?? ''
  switch (host) {
    case 'attendance':
      return { kind: 'attendance' }
    case 'timetable':
      return { kind: 'timetable' }
    case 'home':
      return { kind: 'home' }
    case 'assignment': {
      const raw = new URLSearchParams(query).get('url')
      if (!raw) return null
      return { kind: 'assignment', url: raw }
    }
    default:
      return null
  }
}
