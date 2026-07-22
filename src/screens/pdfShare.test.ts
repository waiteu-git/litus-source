import { describe, it, expect } from 'vitest'
import {
  sanitizePdfFilename,
  isWithinShareLimit,
  PDF_SHARE_LIMIT_BYTES,
  buildSharePdfJs,
  classifySharePayload,
  sanitizeDownloadFilename,
} from './pdfShare'

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

describe('classifySharePayload — 取得したものが本当にPDFか', () => {
  // 実機報告(2026-07-22): PDFを共有すると CLASS のログインページHTMLが .pdf として保存された。
  // 原因は buildSharePdfJs が res.ok とサイズしか見ておらず、**ログインページは HTTP 200 で返る**ため
  // 素通りしていたこと。「認証が切れた」という回復可能な状態が、黙ってファイルを壊す形で出ていた。
  const PDF_B64 = 'JVBERi0xLjcKJeLjz9M='            // '%PDF-1.7\n%âãÏÓ'
  const HTML_B64 = 'PCFET0NUWVBFIGh0bWw+'          // '<!DOCTYPE html>'
  const HTML_LOWER_B64 = 'PCFkb2N0eXBlIGh0bWw+'    // '<!doctype html>'

  it('PDFのマジックバイトがあれば ok', () => {
    expect(classifySharePayload({ dataBase64: PDF_B64, contentType: 'application/pdf' })).toBe('ok')
  })
  it('content-type が無くても中身がPDFなら ok（CLASSは型を返さないことがある）', () => {
    expect(classifySharePayload({ dataBase64: PDF_B64, contentType: null })).toBe('ok')
  })
  it('HTMLが返ってきたら login とみなす（本件の再現）', () => {
    expect(classifySharePayload({ dataBase64: HTML_B64, contentType: 'text/html; charset=utf-8' })).toBe('login')
    expect(classifySharePayload({ dataBase64: HTML_LOWER_B64, contentType: 'text/html' })).toBe('login')
  })
  it('content-type が html ならマジックバイトを待たず login', () => {
    expect(classifySharePayload({ dataBase64: 'AAAA', contentType: 'text/html' })).toBe('login')
  })
  it('PDFでもHTMLでもなければ notPdf（壊れたファイルを黙って渡さない）', () => {
    expect(classifySharePayload({ dataBase64: 'AAAAAAAA', contentType: 'image/png' })).toBe('notPdf')
  })
  it('空なら notPdf', () => {
    expect(classifySharePayload({ dataBase64: '', contentType: null })).toBe('notPdf')
  })
})

describe('buildSharePdfJs は content-type を持ち帰る', () => {
  it('res.headers から content-type を読んで postMessage に載せる', () => {
    const js = buildSharePdfJs()
    expect(js).toContain("res.headers.get('content-type')")
    expect(js).toContain('contentType')
  })
})

describe('sanitizeDownloadFilename', () => {
  it('日本語のファイル名を保つ（Androidのサニタイズは "=-1" のようなゴミにしていた）', () => {
    expect(sanitizeDownloadFilename('2026年度前期試験期間における大学院科目の教室変更について.pdf'))
      .toBe('2026年度前期試験期間における大学院科目の教室変更について.pdf')
  })
  it('パス区切りを剥がす（../ を封じる）', () => {
    expect(sanitizeDownloadFilename('../../etc/passwd.txt')).toBe('passwd.txt')
  })
  it('禁止文字を落とし拡張子は残す', () => {
    expect(sanitizeDownloadFilename('a<b>c:d.pdf')).toBe('a_b_c_d.pdf')
  })
  it('拡張子が無ければ付けない', () => {
    expect(sanitizeDownloadFilename('report')).toBe('report')
  })
  it('空なら fallback', () => {
    expect(sanitizeDownloadFilename('///')).toBe('download')
  })
})
