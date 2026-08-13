/**
 * 注入スクリプト（WebView へ injectJavaScript する文字列）の構文検査。
 *
 * この層は **型チェックもテストも素通りする**: TypeScript から見ればただの文字列で、
 * 実行されるのは実機の WebView の中だけ。構文を1文字壊すと収集が丸ごと静かに止まる
 * （postMessage が来ない＝タイムアウトで次へ進むので、エラーとしても見えにくい）。
 * ここで最低限「パースは通る」ことを機械的に固定しておく。
 */
import { describe, expect, it } from 'vitest'
import * as scripts from './injectedScripts'
import { LETUS_AUTH_PROBE } from './injectedScripts'

const SCRIPT_NAME = /(_JS|_PRELUDE|_PROBE)$/

describe('注入スクリプトの構文', () => {
  const entries = Object.entries(scripts).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && SCRIPT_NAME.test(e[0]),
  )

  it('検査対象を取りこぼしていない', () => {
    expect(entries.length).toBeGreaterThan(3)
    expect(entries.map(([n]) => n)).toEqual(
      expect.arrayContaining(['COLLECT_MYCOURSES_JS', 'COLLECT_COURSE_PAGE_JS', 'LETUS_AUTH_PROBE']),
    )
  })

  for (const [name, src] of entries) {
    it(`${name} はパースできる`, () => {
      expect(() => new Function(src)).not.toThrow()
    })
  }
})

describe('litusAuthProbe（ページ内で認証状態を直接読む）', () => {
  function run(fakeWindow: unknown): { hasMcfg: boolean; loggedIn: boolean } {
    const fn = new Function('window', `${LETUS_AUTH_PROBE}\nreturn litusAuthProbe();`)
    return fn(fakeWindow) as { hasMcfg: boolean; loggedIn: boolean }
  }

  it('sesskey があればログイン済み（Moodleがログイン時にのみ出す値）', () => {
    expect(run({ M: { cfg: { sesskey: 'abc123', wwwroot: 'https://letus.ed.tus.ac.jp' } } })).toEqual({
      hasMcfg: true,
      loggedIn: true,
    })
  })

  it('M.cfg はあるが sesskey が無ければ「Moodleだが未ログイン」', () => {
    expect(run({ M: { cfg: { wwwroot: 'https://letus.ed.tus.ac.jp' } } })).toEqual({
      hasMcfg: true,
      loggedIn: false,
    })
  })

  it('Moodle でないページ（SSO/IdP等）は両方 false', () => {
    expect(run({})).toEqual({ hasMcfg: false, loggedIn: false })
    expect(run({ M: {} })).toEqual({ hasMcfg: false, loggedIn: false })
  })

  it('window へのアクセスが投げても落ちない（クロスオリジン等）', () => {
    const hostile = {
      get M(): never {
        throw new Error('cross-origin')
      },
    }
    expect(() => run(hostile)).not.toThrow()
    expect(run(hostile)).toEqual({ hasMcfg: false, loggedIn: false })
  })
})
