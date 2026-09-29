import { describe, expect, it } from 'vitest'
import { REDISPLAY_ATTENDANCE_JS } from './injectedScripts'

/**
 * 出席ページ自身の「再表示する」ボタンを押す注入スクリプト（学外ネットワーク警告の「再確認」用）。
 *
 * 動機（2026-09-29 の実機報告）: 出席画面を開いたまま学内Wi-Fiへ切り替えても、学外警告が消えずアプリの
 * 再起動が要った。原因は、着地ガード（OPEN_ATTENDANCE_JS の `attendance-already`）が「既に出席ページに居る
 * ならCLASSへ何も送らない」ため、再確認もポーリングも画面に残った古いDOMを読み直すだけだったこと。
 * 「学内/学外ネットワークからのアクセス」はサーバーがページ描画時のIPで出すラベルなので、取り直さない限り
 * 最初の値のまま動かない。ページ自身の「再表示する」は PrimeFaces.ab(u:"@all") でサーバーから全体を
 * 再描画する（実DOM: __fixtures__/attendance-reaction-pending-real.html）。
 */

type FakeButton = {
  textContent: string
  value: string
  _clicked: number
  getAttribute: (attr: string) => string | null
  click: () => void
}

function button(text: string, onclick: string | null = null): FakeButton {
  return {
    textContent: text,
    value: '',
    _clicked: 0,
    getAttribute(attr: string) {
      return attr === 'onclick' ? onclick : null
    },
    click() {
      this._clicked += 1
    },
  }
}

function anchor(text: string): FakeButton {
  return button(text)
}

function run(buttons: FakeButton[], anchors: FakeButton[] = []) {
  const posted: Record<string, unknown>[] = []
  const document = {
    body: { innerText: '', textContent: '' },
    querySelectorAll(sel: string) {
      if (sel === 'a') return anchors
      if (/button|submit/.test(sel)) return buttons
      return []
    },
  }
  const windowObj = { ReactNativeWebView: { postMessage: (s: string) => posted.push(JSON.parse(s)) } }
  function FakeMouseEvent() {
    /* noop */
  }
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'MouseEvent', REDISPLAY_ATTENDANCE_JS)(windowObj, document, FakeMouseEvent)
  return posted
}

describe('REDISPLAY_ATTENDANCE_JS', () => {
  it('「再表示する」ボタンを押し、redisplay-click を通知する（onclick が無ければ click()）', () => {
    const redisplay = button('再表示する')
    const posted = run([button('前の授業'), redisplay, button('次の授業')])
    expect(redisplay._clicked).toBe(1)
    expect(posted).toEqual([expect.objectContaining({ type: 'nav', ok: true, stage: 'redisplay-click' })])
  })

  it('onclick 属性があればそれを直接実行する（PrimeFaces のボタンは onclick に ajax を持つ）', () => {
    const g = globalThis as unknown as { __redisplayFired?: number }
    g.__redisplayFired = 0
    const redisplay = button('再表示する', 'globalThis.__redisplayFired = (globalThis.__redisplayFired || 0) + 1; return false;')
    const posted = run([redisplay])
    expect(g.__redisplayFired).toBe(1)
    expect(redisplay._clicked).toBe(0)
    expect(posted[0]).toMatchObject({ ok: true, stage: 'redisplay-click', method: 'onclick' })
    delete g.__redisplayFired
  })

  it('ボタンが無ければ何も押さず redisplay-missing を通知する（RN 側が作り直しへ切り替える合図）', () => {
    const others = [button('前の授業'), button('次の授業'), button('出席登録する')]
    const posted = run(others)
    expect(others.every((b) => b._clicked === 0)).toBe(true)
    expect(posted).toEqual([expect.objectContaining({ type: 'nav', ok: false, stage: 'redisplay-missing' })])
  })

  it('他のボタン（出席登録する・前後の授業）とメニューのアンカーは押さない', () => {
    const submit = button('出席登録する')
    const prev = button('前の授業')
    const menu = anchor('モバイル出席登録')
    run([submit, prev, button('再表示する')], [menu])
    expect(submit._clicked).toBe(0)
    expect(prev._clicked).toBe(0)
    expect(menu._clicked).toBe(0)
  })
})
