import { describe, expect, it } from 'vitest'
import { readAuthSignals } from './authSignals'

describe('readAuthSignals（WebViewからの認証シグナル読み取り）', () => {
  it('両フィールドが boolean なら採用する', () => {
    expect(readAuthSignals({ hasMcfg: true, loggedIn: true })).toEqual({ hasMcfg: true, loggedIn: true })
    expect(readAuthSignals({ hasMcfg: true, loggedIn: false })).toEqual({ hasMcfg: true, loggedIn: false })
  })

  it('報告が無い/形が違うものは null（＝従来どおりHTMLから推定させる）', () => {
    expect(readAuthSignals(undefined)).toBeNull()
    expect(readAuthSignals(null)).toBeNull()
    expect(readAuthSignals('logged_in')).toBeNull()
    expect(readAuthSignals(123)).toBeNull()
  })

  it('片方だけ壊れた報告は採用しない（健全なページを未ログイン扱いしないため）', () => {
    // ここで {hasMcfg:true, loggedIn:false} として拾うと、報告が壊れているだけのページを
    // 「ログインしていない」と断定してしまう。落とす側へ倒すのが安全。
    expect(readAuthSignals({ hasMcfg: true })).toBeNull()
    expect(readAuthSignals({ loggedIn: true })).toBeNull()
    expect(readAuthSignals({ hasMcfg: 'yes', loggedIn: 'yes' })).toBeNull()
  })
})
