import { classifyLinkTarget } from './externalLink'

/** 既定はトップフレームのナビゲーション（外部化の対象）。 */
function target(url: string, isTopFrame = true) {
  return classifyLinkTarget({ url, isTopFrame })
}

describe('classifyLinkTarget: 学内ホスト', () => {
  it('LETUS / CLASS はアプリ内', () => {
    expect(target('https://letus.ed.tus.ac.jp/course/view.php?id=1')).toBe('in-app')
    expect(target('https://class.admin.tus.ac.jp/uprx/up/bs/bsd007/Bsd00701.xhtml')).toBe('in-app')
  })

  it('学内IdP・図書館・大学サイトもアプリ内（tus.ac.jp 配下すべて）', () => {
    expect(target('https://idp.admin.tus.ac.jp/idp/profile/SAML2/Redirect/SSO')).toBe('in-app')
    expect(target('https://idp.tus.ac.jp/idp/profile/SAML2/Redirect/SSO')).toBe('in-app')
    expect(target('https://tuslibrary.admin.tus.ac.jp/')).toBe('in-app')
    expect(target('https://tus.ac.jp/')).toBe('in-app')
  })

  it('ホスト名の大文字・ポート・末尾ドットでも学内と判定する', () => {
    expect(target('https://LETUS.ED.TUS.AC.JP/my/courses.php')).toBe('in-app')
    expect(target('https://letus.ed.tus.ac.jp:443/my/courses.php')).toBe('in-app')
    expect(target('https://letus.ed.tus.ac.jp./my/courses.php')).toBe('in-app')
  })

  it('接尾辞はラベル境界で一致させる（部分一致で通さない）', () => {
    expect(target('https://notus.ac.jp/')).toBe('external')
    expect(target('https://evil-tus.ac.jp/')).toBe('external')
    expect(target('https://tus.ac.jp.example.com/')).toBe('external')
  })

  it('userinfo で学内ホストに見せかけたURLは外部（実ホストで判定する）', () => {
    expect(target('https://letus.ed.tus.ac.jp@example.com/file')).toBe('external')
    expect(target('https://a@letus.ed.tus.ac.jp@example.com/file')).toBe('external')
  })
})

describe('classifyLinkTarget: 大学SSOの連合先', () => {
  it('Microsoftのログイン基盤と従属リソースはアプリ内（ログイン連鎖を切らない）', () => {
    expect(target('https://login.microsoftonline.com/common/oauth2/authorize?x=1')).toBe('in-app')
    expect(target('https://login.microsoft.com/')).toBe('in-app')
    expect(target('https://login.live.com/oauth20_authorize.srf')).toBe('in-app')
    expect(target('https://login.windows.net/common')).toBe('in-app')
    expect(target('https://aadcdn.msauth.net/shared/1.0/content/js/x.js')).toBe('in-app')
    expect(target('https://aadcdn.msftauth.net/ests/2.1/content/cdnbundles/x.css')).toBe('in-app')
    expect(target('https://aadcdn.msauthimages.net/logo.png')).toBe('in-app')
    expect(target('https://autologon.microsoftazuread-sso.com/tus.ac.jp/winauth')).toBe('in-app')
  })

  it('Microsoftでもログイン基盤でないホストは外部', () => {
    expect(target('https://tus-my.sharepoint.com/personal/x/Documents/a.docx')).toBe('external')
    expect(target('https://www.microsoft.com/ja-jp/')).toBe('external')
  })
})

describe('classifyLinkTarget: 未知ホストでもSSO連鎖の途中なら留める', () => {
  it('SAML/OIDCのマーカーを持つURLはアプリ内（未知のIdPが挟まっても壊さない）', () => {
    expect(target('https://sso.example.ac.jp/redirect?SAMLRequest=abc')).toBe('in-app')
    expect(target('https://sso.example.ac.jp/acs?SAMLResponse=abc&RelayState=x')).toBe('in-app')
    expect(target('https://ds.gakunin.nii.ac.jp/WAYF/idp/x')).toBe('in-app')
    expect(target('https://sso.example.com/adfs/ls/?wa=wsignin1.0')).toBe('in-app')
    expect(target('https://auth.example.com/oauth2/authorize?client_id=1')).toBe('in-app')
    expect(target('https://auth.example.com/x?scope=openid+profile')).toBe('in-app')
    expect(target('https://sp.example.com/Shibboleth.sso/SAML2/POST')).toBe('in-app')
  })

  it('マーカーの無い一般の外部リンクは外部（Box等）', () => {
    expect(target('https://tus.box.com/s/abcdef123456')).toBe('external')
    expect(target('https://app.box.com/s/abcdef123456')).toBe('external')
    expect(target('https://drive.google.com/file/d/xxx/view')).toBe('external')
    expect(target('https://www.youtube.com/watch?v=xxx')).toBe('external')
    expect(target('https://forms.gle/xxxx')).toBe('external')
  })
})

describe('classifyLinkTarget: スキーム', () => {
  it('mailto / tel はWebViewで開けないので外部に渡す', () => {
    expect(target('mailto:someone@example.com')).toBe('external')
    expect(target('MAILTO:someone@example.com')).toBe('external')
    expect(target('tel:+81-3-0000-0000')).toBe('external')
  })

  it('about:blank / data / blob / javascript はアプリ内（WebViewの内部動作を壊さない）', () => {
    expect(target('about:blank')).toBe('in-app')
    expect(target('data:text/html,<p>x</p>')).toBe('in-app')
    expect(target('blob:https://letus.ed.tus.ac.jp/abc')).toBe('in-app')
    expect(target('javascript:void(0)')).toBe('in-app')
  })

  it('未知スキームはアプリ内に留める（勝手に他アプリを起動しない）', () => {
    expect(target('intent://scan/#Intent;scheme=zxing;end')).toBe('in-app')
    expect(target('msauth://com.example/callback')).toBe('in-app')
    expect(target('market://details?id=com.example')).toBe('in-app')
  })

  it('スキームもホストも読めない入力はアプリ内（判定不能で外部化しない）', () => {
    expect(target('')).toBe('in-app')
    expect(target('   ')).toBe('in-app')
    expect(target('//example.com/path')).toBe('in-app')
    expect(target('https://')).toBe('in-app')
    expect(target('not a url')).toBe('in-app')
  })
})

describe('classifyLinkTarget: フレーム', () => {
  it('トップフレーム以外は外部化しない（埋め込みiframeで他アプリが起動しないように）', () => {
    expect(target('https://tus.box.com/s/abcdef123456', false)).toBe('in-app')
    expect(target('https://www.youtube.com/embed/xxx', false)).toBe('in-app')
    expect(target('mailto:someone@example.com', false)).toBe('in-app')
  })

  it('isTopFrame が未指定ならアプリ内（フレーム不明で外部化しない＝パッチ剥落時の安全側）', () => {
    expect(classifyLinkTarget({ url: 'https://tus.box.com/s/abc' })).toBe('in-app')
    expect(classifyLinkTarget({ url: 'mailto:someone@example.com' })).toBe('in-app')
    expect(classifyLinkTarget({ url: 'https://letus.ed.tus.ac.jp/my/' })).toBe('in-app')
  })
})
