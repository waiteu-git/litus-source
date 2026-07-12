import { describe, it, expect } from 'vitest'
import { decideLetusFetch } from './letusFetchDecision'

const ASSIGN_URL = 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=123'

describe('decideLetusFetch', () => {
  it('パスワード欄を含むHTMLは needsLogin（セッション切れ）', () => {
    const html = '<form><input type="password" name="pw"></form>'
    expect(decideLetusFetch(html, ASSIGN_URL)).toBe('needsLogin')
  })

  it('課題ページURL＋通常HTMLは body（抽出可）', () => {
    const html = '<div role="main"><div id="intro">本文</div></div>'
    expect(decideLetusFetch(html, ASSIGN_URL)).toBe('body')
  })

  it('mod以外のURL（SSO途中）は wait', () => {
    const html = '<html><body>Redirecting…</body></html>'
    const url = 'https://idp.tus.ac.jp/idp/profile/SAML2/Redirect/SSO'
    expect(decideLetusFetch(html, url)).toBe('wait')
  })
})
