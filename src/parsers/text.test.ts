import { describe, it, expect } from 'vitest'
import { richHtmlToText } from './text'

describe('richHtmlToText', () => {
  it('<br>を改行に、&nbsp;を空白に変換し前後空白を落とす', () => {
    expect(richHtmlToText('  1行目<br>2行目&nbsp;続き ')).toBe('1行目\n2行目 続き')
  })

  it('タグを除去しつつ段落間の過剰な空行を畳む', () => {
    expect(richHtmlToText('<p>A</p><br><br><br><p>B</p>')).toBe('A\n\nB')
  })
})
