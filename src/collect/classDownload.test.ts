import { describe, it, expect } from 'vitest'
import { decodeRfc2047, filenameFromContentDisposition, CLASS_DOWNLOAD_CAPTURE_JS } from './classDownload'

// カナリアの実セッションで採取した本物の Content-Disposition（2026-07-22）。
// encoded-word が2つに分割されており、RFC2047 では**隣接する encoded-word 間の空白は捨てる**。
const REAL_CD =
  'attachment;filename="=?UTF-8?B?MjAyNuW5tOW6puWJjeacn+ippumok+acn+mWk+OBq+OBiuOBkeOCi+Wkpw==?= =?UTF-8?B?5a2m6Zmi56eR55uu44Gu5pWZ5a6k5aSJ5pu044Gr44Gk44GE44GmLnBkZg==?="'
const REAL_NAME = '2026年度前期試験期間における大学院科目の教室変更についてのpdf'.replace('のpdf', '.pdf')

describe('decodeRfc2047', () => {
  it('B encoding のUTF-8を復号する', () => {
    expect(decodeRfc2047('=?UTF-8?B?44GC?=')).toBe('あ')
  })
  it('隣接する encoded-word の間の空白は捨てる（RFC2047）', () => {
    // ここを素直に空白のまま繋ぐと、実ファイル名に余計な空白が入る。
    expect(decodeRfc2047('=?UTF-8?B?44GC?= =?UTF-8?B?44GE?=')).toBe('あい')
  })
  it('encoded-word でない部分はそのまま残す', () => {
    expect(decodeRfc2047('report_=?UTF-8?B?44GC?=.pdf')).toBe('report_あ.pdf')
  })
  it('Q encoding も復号する', () => {
    expect(decodeRfc2047('=?UTF-8?Q?a=E3=81=82b?=')).toBe('aあb')
  })
  it('壊れた encoded-word は落とさずそのまま返す', () => {
    expect(decodeRfc2047('=?UTF-8?B?@@@@?=')).toBe('=?UTF-8?B?@@@@?=')
  })
  it('encoded-word が無ければ素通し', () => {
    expect(decodeRfc2047('plain.pdf')).toBe('plain.pdf')
  })
})

describe('filenameFromContentDisposition', () => {
  it('実サーバの応答から本物のファイル名を取り出す（本件の再現）', () => {
    // 復号しないと Android は "=-1" のようなゴミ名で保存する（実機で観測）。
    expect(filenameFromContentDisposition(REAL_CD)).toBe(REAL_NAME)
  })
  it('filename*=（RFC5987）を優先する', () => {
    expect(
      filenameFromContentDisposition("attachment; filename=\"fallback.pdf\"; filename*=UTF-8''%E3%81%82.pdf"),
    ).toBe('あ.pdf')
  })
  it('素の filename も読む', () => {
    expect(filenameFromContentDisposition('attachment; filename="a b.pdf"')).toBe('a b.pdf')
  })
  it('引用符が無くても読む', () => {
    expect(filenameFromContentDisposition('attachment; filename=plain.pdf')).toBe('plain.pdf')
  })
  it('取れなければ null（呼び出し側でURL由来の名前へフォールバックする）', () => {
    expect(filenameFromContentDisposition('attachment')).toBeNull()
    expect(filenameFromContentDisposition(null)).toBeNull()
  })
})

describe('CLASS_DOWNLOAD_CAPTURE_JS', () => {
  it('submit を capture で横取りする（バブリングでは JSF に先を越される）', () => {
    expect(CLASS_DOWNLOAD_CAPTURE_JS).toContain("addEventListener('submit'")
    expect(CLASS_DOWNLOAD_CAPTURE_JS).toContain('true)')
    expect(CLASS_DOWNLOAD_CAPTURE_JS).toContain('preventDefault')
  })
  it('submitter を FormData に含める（JSFはどのボタンが押されたかで動作を決める）', () => {
    expect(CLASS_DOWNLOAD_CAPTURE_JS).toContain('submitter')
  })
  it('credentials を include する（セッションが乗らないとログインページが返る）', () => {
    expect(CLASS_DOWNLOAD_CAPTURE_JS).toContain("credentials: 'include'")
    expect(CLASS_DOWNLOAD_CAPTURE_JS).toContain("method: 'POST'")
  })
  it('二重注入しても listener が増えない', () => {
    expect(CLASS_DOWNLOAD_CAPTURE_JS).toContain('__litusDlHooked')
  })
})
