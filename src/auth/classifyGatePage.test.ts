import { describe, expect, it } from 'vitest'
import { canDeferLoginUi, classifyGatePage, isSpeculativeLogin } from './classifyGatePage'

const base = { hasPasswordInput: false, hasClassMenu: false, hasEnterSplash: false, hasSsoStale: false }

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
  it('IdPの「過去のリクエスト」エラーページは stale（キャッシュ破棄して再試行させる）', () => {
    expect(classifyGatePage({ ...base, hasSsoStale: true })).toBe('stale')
  })
  it('LETUSに迷い込んだら stray（SSOリレー混線→CLASSへ誘導し直す）', () => {
    expect(classifyGatePage({ ...base, url: 'https://letus.ed.tus.ac.jp/my/' })).toBe('stray')
  })
  it('ログアウトリンクがあれば authed（出欠管理メニューが無いポータルでもログイン済みと判定）', () => {
    expect(classifyGatePage({ ...base, hasLogout: true })).toBe('authed')
  })
  it('システムメンテナンス画面は maintenance（pendingで詰まらせない）', () => {
    expect(classifyGatePage({ ...base, hasMaintenance: true })).toBe('maintenance')
  })
  it('メンテナンスでもログイン済み（メニュー/ログアウト）なら authed を優先', () => {
    expect(classifyGatePage({ ...base, hasMaintenance: true, hasClassMenu: true })).toBe('authed')
  })
  it('メンテナンスでもパスワード欄があれば needsLogin を優先', () => {
    expect(classifyGatePage({ ...base, hasMaintenance: true, hasPasswordInput: true })).toBe('needsLogin')
  })
})

describe('isSpeculativeLogin（needsLogin の根拠が推測か確定か）', () => {
  const MS = 'https://login.microsoftonline.com/common/oauth2/authorize?x=1'

  it('SSOのURLに居るだけ（パスワード欄なし）は推測＝自動完走で消えうる', () => {
    // 起動直後のSAML往復はこのURLを必ず通る。IdP側Cookieが生きていれば操作なしで完走するので、
    // この時点で「ログインが必要」と確定させてはいけない。
    expect(isSpeculativeLogin({ ...base, url: MS })).toBe(true)
  })

  it('パスワード欄が実在すれば確定（猶予せず即ログインUIを出してよい）', () => {
    expect(isSpeculativeLogin({ ...base, hasPasswordInput: true, url: MS })).toBe(false)
  })

  it('SSO以外のURLは推測でない（猶予の対象外）', () => {
    expect(isSpeculativeLogin({ ...base, url: 'https://class.admin.tus.ac.jp/uprx/' })).toBe(false)
    expect(isSpeculativeLogin({ ...base })).toBe(false)
  })

  it('classifyGatePage の needsLogin 判定自体は変えない（推測でも確定でも needsLogin）', () => {
    expect(classifyGatePage({ ...base, url: MS })).toBe('needsLogin')
    expect(classifyGatePage({ ...base, hasPasswordInput: true, url: MS })).toBe('needsLogin')
  })
})

describe('canDeferLoginUi（猶予を使ってよい遷移元か）', () => {
  const MS = 'https://login.microsoftonline.com/common/oauth2/authorize?x=1'

  it('ブート画面が既に出ている状態からの推測なら猶予してよい', () => {
    expect(canDeferLoginUi({ ...base, url: MS }, 'checking')).toBe(true)
    expect(canDeferLoginUi({ ...base, url: MS }, 'loading')).toBe(true)
  })

  it('firstRun（スライド完走直後）からは猶予しない', () => {
    // ブート画面はスライド表示中に外れている。ここで猶予に入ると overlay ごと再マウントされ、
    // 4秒の起動イントロが頭から再生されて1.5秒で切られる（見た目の退行）。
    expect(canDeferLoginUi({ ...base, url: MS }, 'firstRun')).toBe(false)
  })

  it('connError からは猶予しない（デモボタンを持つカードを引っ込めない）', () => {
    // 接続エラーカードはデモ導線を載せている。猶予で1.5秒消すと審査の生命線を隠すことになる。
    expect(canDeferLoginUi({ ...base, url: MS }, 'connError')).toBe(false)
  })

  it('パスワード欄が実在すれば、遷移元によらず猶予しない', () => {
    expect(canDeferLoginUi({ ...base, hasPasswordInput: true, url: MS }, 'checking')).toBe(false)
  })
})
