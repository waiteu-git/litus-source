import { describe, it, expect } from 'vitest'
import { sanitizePdfFilename, isWithinShareLimit, PDF_SHARE_LIMIT_BYTES, buildSharePdfJs } from './pdfShare'

describe('sanitizePdfFilename', () => {
  it('URL末尾のファイル名を使い.pdfを保証する', () => {
    expect(sanitizePdfFilename('https://letus.ed.tus.ac.jp/pluginfile.php/1/mod_resource/content/0/week1.pdf'))
      .toBe('week1.pdf')
  })
  it('拡張子が無ければ.pdfを付ける', () => {
    expect(sanitizePdfFilename('https://x/y/report')).toBe('report.pdf')
  })
  it('危険文字を除去する', () => {
    expect(sanitizePdfFilename('https://x/a b/レポート?v=1.pdf')).toMatch(/\.pdf$/)
    expect(sanitizePdfFilename('https://x/a b/レポート?v=1.pdf')).not.toMatch(/[?\\/]/)
  })
  it('末尾が空ならdocument.pdf', () => {
    expect(sanitizePdfFilename('https://letus.ed.tus.ac.jp/')).toBe('document.pdf')
  })
})

describe('isWithinShareLimit', () => {
  it('0以下は不可', () => { expect(isWithinShareLimit(0)).toBe(false) })
  it('上限以内は可', () => { expect(isWithinShareLimit(1024)).toBe(true) })
  it('上限超は不可', () => { expect(isWithinShareLimit(PDF_SHARE_LIMIT_BYTES + 1)).toBe(false) })
})

describe('buildSharePdfJs', () => {
  it('必要トークンを含むJSを返す', () => {
    const js = buildSharePdfJs()
    expect(js).toContain('window.__PDF_URL')
    expect(js).toContain('credentials')
    expect(js).toContain("stage:'share'")
  })
})
