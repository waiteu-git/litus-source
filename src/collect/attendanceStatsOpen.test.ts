import { afterEach, describe, expect, it } from 'vitest'
import { OPEN_ATTENDANCE_STATS_JS } from './injectedScripts'

/**
 * OPEN_ATTENDANCE_STATS_JS の回帰（openAttendanceGuard.test.ts と同型のフェイクDOM実行）。
 *
 * 実DOM（2026-07-15 pi canary採取）: メニュー「学生出欠状況確認」の <a> は
 * onclick="confirmIfModified(this);return false;" のみで、本当の遷移コマンドは
 * data-pfconfirmcommand（menuid 4_0_0_0 の menuForm submit）に入っている。
 * OPEN_BULLETIN_JS が実証済みのとおり、confirmIfModified は「変更あり」時に確認ダイアログで
 * headless を止める危険があるため、dpc → onclick → click の順で発火する（fireIn と同則）。
 */

const PORTAL_URL = 'https://class.admin.tus.ac.jp/uprx/up/pk/pky001/Pky00102.xhtml'

type FakeAnchor = {
  textContent: string
  id: string
  name: string
  _clicked: number
  attrs: Record<string, string>
  getAttribute: (attr: string) => string | null
  click: () => void
}

function anchor(text: string, attrs: Record<string, string> = {}, id = ''): FakeAnchor {
  return {
    textContent: text,
    id,
    name: '',
    _clicked: 0,
    attrs,
    getAttribute(a: string) {
      return this.attrs[a] ?? null
    },
    click() {
      this._clicked += 1
    },
  }
}

/** 注入スクリプト(IIFE)をフェイク環境で実行し、postMessage されたメッセージ列を返す。 */
function runOpenStats(env: { url: string; anchors?: FakeAnchor[]; landed?: boolean }): {
  posted: Record<string, unknown>[]
  anchors: FakeAnchor[]
} {
  const posted: Record<string, unknown>[] = []
  const anchors = env.anchors ?? []

  const location = { href: env.url }
  const document = {
    body: { innerText: '', textContent: '' },
    querySelector(sel: string) {
      // 着地ガード: 出欠テーブル本体セルの有無
      if (sel.includes('jugyoKaisuTbl')) return env.landed ? {} : null
      return null
    },
    querySelectorAll(sel: string) {
      if (sel === 'a') return anchors
      return []
    },
  }
  const windowObj = {
    ReactNativeWebView: {
      postMessage(s: string) {
        posted.push(JSON.parse(s))
      },
    },
  }
  function FakeMouseEvent() {
    /* noop constructor */
  }

  // eslint-disable-next-line no-new-func
  const run = new Function('window', 'document', 'location', 'MouseEvent', OPEN_ATTENDANCE_STATS_JS)
  run(windowObj, document, location, FakeMouseEvent)
  return { posted, anchors }
}

declare global {
  // eslint-disable-next-line no-var
  var __statsDpc: number | undefined
  // eslint-disable-next-line no-var
  var __statsOnclick: number | undefined
}

afterEach(() => {
  delete globalThis.__statsDpc
  delete globalThis.__statsOnclick
})

describe('OPEN_ATTENDANCE_STATS_JS', () => {
  it('着地済み(jugyoKaisuTblのセルあり) → メニューを叩かない（attendance-already）', () => {
    const menuAnchor = anchor('学生出欠状況確認', {
      'data-pfconfirmcommand': 'globalThis.__statsDpc = (globalThis.__statsDpc||0)+1',
    })
    const { posted, anchors } = runOpenStats({ url: PORTAL_URL, anchors: [menuAnchor], landed: true })
    expect(posted.some((m) => m.stage === 'attendance-already')).toBe(true)
    expect(posted.some((m) => m.stage === 'attendance-click')).toBe(false)
    expect(anchors[0]._clicked).toBe(0)
    expect(globalThis.__statsDpc).toBeUndefined()
  })

  it('未着地 → data-pfconfirmcommand を最優先で直接実行する（confirmIfModified経由にしない）', () => {
    const menuAnchor = anchor('学生出欠状況確認', {
      onclick: 'globalThis.__statsOnclick = (globalThis.__statsOnclick||0)+1',
      'data-pfconfirmcommand': 'globalThis.__statsDpc = (globalThis.__statsDpc||0)+1',
    })
    const { posted, anchors } = runOpenStats({ url: PORTAL_URL, anchors: [menuAnchor], landed: false })
    expect(globalThis.__statsDpc).toBe(1)
    expect(globalThis.__statsOnclick).toBeUndefined() // onclick(confirmIfModified相当)は実行しない
    expect(anchors[0]._clicked).toBe(0)
    const click = posted.find((m) => m.stage === 'attendance-click')
    expect(click?.ok).toBe(true)
    expect(click?.method).toBe('pfconfirm')
  })

  it('dpcが無ければ onclick 属性で発火する（従来フォールバック）', () => {
    const menuAnchor = anchor('学生出欠状況確認', {
      onclick: 'globalThis.__statsOnclick = (globalThis.__statsOnclick||0)+1',
    })
    const { posted } = runOpenStats({ url: PORTAL_URL, anchors: [menuAnchor], landed: false })
    expect(globalThis.__statsOnclick).toBe(1)
    const click = posted.find((m) => m.stage === 'attendance-click')
    expect(click?.method).toBe('onclick')
  })

  it('dpcもonclickも無ければ .click() で発火する', () => {
    const menuAnchor = anchor('学生出欠状況確認', {})
    const { posted, anchors } = runOpenStats({ url: PORTAL_URL, anchors: [menuAnchor], landed: false })
    expect(anchors[0]._clicked).toBe(1)
    const click = posted.find((m) => m.stage === 'attendance-click')
    expect(click?.method).toBe('click')
  })
})
