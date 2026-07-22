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
  it('クエリを落としベース名を保つ', () => {
    // 旧アサーションは「.pdfで終わる」「区切り文字を含まない」だけを見ており、
    // 実際の戻り値 'document.pdf'（＝ベース名が全部消えた状態）でも緑になっていた。
    expect(sanitizePdfFilename('https://x/a b/レポート?v=1.pdf')).toBe('レポート.pdf')
  })
  it('末尾が空ならdocument.pdf', () => {
    expect(sanitizePdfFilename('https://letus.ed.tus.ac.jp/')).toBe('document.pdf')
  })

  it('日本語のファイル名を保つ（percent-encoded の実LETUS形）', () => {
    expect(
      sanitizePdfFilename(
        'https://letus.ed.tus.ac.jp/pluginfile.php/1/mod_resource/content/0/%E7%AC%AC1%E5%9B%9E%E8%AC%9B%E7%BE%A9%E8%B3%87%E6%96%99.pdf',
      ),
    ).toBe('第1回講義資料.pdf')
  })
  it('日本語だけの名前が拡張子のみに潰れない', () => {
    expect(sanitizePdfFilename('https://x/y/微分積分学.pdf')).toBe('微分積分学.pdf')
  })
  it('空白は_にする', () => {
    expect(sanitizePdfFilename('https://x/y/線形代数 第3回.pdf')).toBe('線形代数_第3回.pdf')
  })
  it('括弧は残す', () => {
    expect(sanitizePdfFilename('https://x/y/レポート課題(第2回).pdf')).toBe('レポート課題(第2回).pdf')
  })

  it('パストラバーサルを無害化する', () => {
    for (const u of [
      'https://x/y/%2e%2e%2f%2e%2e%2fetc%2fpasswd.pdf',
      'https://x/y/..%2F..%2Fevil.pdf',
    ]) {
      const n = sanitizePdfFilename(u)
      expect(n).not.toMatch(/[/\\]/)
      expect(n).not.toContain('..')
    }
  })
  it('ファイル名に使えない文字とURIで意味を持つ文字を落とす', () => {
    const n = sanitizePdfFilename('https://x/y/%E9%81%94%E6%88%90%E7%8E%8750%25.pdf')
    // 生の % は Android の Uri.getPath 復号／iOS の自動%エンコードで壊れるため残さない
    expect(n).not.toMatch(/[\u0000-\u001f<>:"/\\|?*%#]/)
  })
  it('先頭がドットにならない（隠しファイル化の防止）', () => {
    expect(sanitizePdfFilename('https://x/y/微分積分学.pdf').startsWith('.')).toBe(false)
  })
  it('Windows予約名を避ける', () => {
    expect(sanitizePdfFilename('https://x/y/CON.pdf')).toBe('_CON.pdf')
  })
  it('長い日本語名をバイト単位で切り詰める（ENAMETOOLONG回避）', () => {
    const url = 'https://x/y/' + encodeURIComponent('あ'.repeat(200)) + '.pdf'
    const n = sanitizePdfFilename(url)
    expect(new TextEncoder().encode(n).length).toBeLessThan(200)
    expect(n.endsWith('.pdf')).toBe(true)
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
