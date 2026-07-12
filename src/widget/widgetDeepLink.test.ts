import { describe, expect, it } from 'vitest'
import { parseWidgetUrl } from './widgetDeepLink'

describe('parseWidgetUrl', () => {
  it('出席リンク', () => {
    expect(parseWidgetUrl('litus://attendance')).toEqual({ kind: 'attendance' })
  })

  it('時間割リンク', () => {
    expect(parseWidgetUrl('litus://timetable')).toEqual({ kind: 'timetable' })
  })

  it('ホームリンク', () => {
    expect(parseWidgetUrl('litus://home')).toEqual({ kind: 'home' })
  })

  it('課題リンクは url クエリをデコードして返す', () => {
    const target = 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=123'
    const link = `litus://assignment?url=${encodeURIComponent(target)}`
    expect(parseWidgetUrl(link)).toEqual({ kind: 'assignment', url: target })
  })

  it('url クエリの無い課題リンクは null', () => {
    expect(parseWidgetUrl('litus://assignment')).toBeNull()
  })

  it('別スキームは null', () => {
    expect(parseWidgetUrl('https://example.com')).toBeNull()
  })

  it('未知のホストは null', () => {
    expect(parseWidgetUrl('litus://settings')).toBeNull()
  })

  it('null/空文字は null', () => {
    expect(parseWidgetUrl(null)).toBeNull()
    expect(parseWidgetUrl('')).toBeNull()
  })
})
