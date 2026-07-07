import { describe, expect, it } from 'vitest'
import { classifyGatePage } from './classifyGatePage'

const base = { hasPasswordInput: false, hasClassMenu: false, hasEnterSplash: false }

describe('classifyGatePage', () => {
  it('CLASSメニュー到達は authed', () => {
    expect(classifyGatePage({ ...base, hasClassMenu: true })).toBe('authed')
  })
  it('パスワード欄があれば needsLogin（最優先）', () => {
    expect(classifyGatePage({ ...base, hasPasswordInput: true, hasClassMenu: true })).toBe('needsLogin')
  })
  it('MicrosoftログインURLは needsLogin（MS初画面はパスワード欄が無いためURLで判定）', () => {
    expect(
      classifyGatePage({ ...base, url: 'https://login.microsoftonline.com/common/oauth2/authorize?x=1' }),
    ).toBe('needsLogin')
  })
  it('入口スプラッシュは未ログインでも表示される公開ページなので authed の根拠にしない（pending）', () => {
    expect(classifyGatePage({ ...base, hasEnterSplash: true })).toBe('pending')
  })
  it('どのシグナルも無ければ pending（リダイレクト途中）', () => {
    expect(classifyGatePage({ ...base, url: 'https://class.admin.tus.ac.jp/uprx/ShibbolethAuthServlet' })).toBe(
      'pending',
    )
  })
})
