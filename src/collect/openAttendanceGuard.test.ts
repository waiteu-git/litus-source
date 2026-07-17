import { describe, expect, it } from 'vitest'
import { ATTENDANCE_URL, OPEN_ATTENDANCE_JS } from './injectedScripts'

/**
 * 着地ガード回帰: OPEN_ATTENDANCE_JS が「既に出席登録ページ(Xua00101)に着地済みなら
 * メニューpostbackを再発火しない」ことを、実際の注入スクリプト文字列をフェイクDOM上で
 * 実行して検証する（OPEN_TIMETABLE_JS / OPEN_ATTENDANCE_STATS_JS と同型のガード）。
 *
 * 動機（CLASS負荷）: 出席ポーリングは授業中に30秒ごと OPEN_ATTENDANCE_JS を撃つ。ガードが無いと
 * 着地済みでも毎回フルPOST（メニュー再遷移）になり、1コマ90分で最大約180回のPOSTに達しうる。
 * 着地済みは抽出(DETECT_ATTENDANCE_JS)だけで足りるので、ここではpostbackを撃たないことを担保する。
 */

const PORTAL_URL = 'https://class.admin.tus.ac.jp/uprx/up/pk/pky501/Pky50101.xhtml'

type FakeAnchor = {
  textContent: string
  id: string
  name: string
  _clicked: number
  getAttribute: (attr: string) => string | null
  click: () => void
}

function anchor(text: string, id = ''): FakeAnchor {
  return {
    textContent: text,
    id,
    name: '',
    _clicked: 0,
    getAttribute() {
      return null // onclick 無し → fire() は el.click() を呼ぶ
    },
    click() {
      this._clicked += 1
    },
  }
}

function submitBtn(text: string) {
  return { textContent: text, value: '' }
}

/** 注入スクリプト(IIFE)をフェイク環境で実行し、postMessage された nav メッセージ列を返す。 */
function runOpenAttendance(env: {
  url: string
  anchors?: FakeAnchor[]
  body?: string
  submitButtons?: { textContent: string; value: string }[]
}): { posted: Record<string, unknown>[]; anchors: FakeAnchor[] } {
  const posted: Record<string, unknown>[] = []
  const anchors = env.anchors ?? []
  const submitButtons = env.submitButtons ?? []
  const body = env.body ?? ''

  const location = { href: env.url }
  const document = {
    body: { innerText: body, textContent: body },
    querySelectorAll(sel: string) {
      if (sel === 'a') return anchors
      if (/submit|button/.test(sel)) return submitButtons
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
  const run = new Function('window', 'document', 'location', 'MouseEvent', OPEN_ATTENDANCE_JS)
  run(windowObj, document, location, FakeMouseEvent)
  return { posted, anchors }
}

describe('OPEN_ATTENDANCE_JS 着地ガード', () => {
  it('出席ページURL(Xua00101)に着地済み → メニューを叩かない（attendance-already）', () => {
    const menuAnchor = anchor('モバイル出席登録', 'menuForm:mobileAttendance')
    const { posted, anchors } = runOpenAttendance({
      url: ATTENDANCE_URL,
      anchors: [menuAnchor],
      body: '出席確認中の履修授業はありません', // 受付中の授業なし状態でもフォーム無しで着地判定できる
    })
    expect(posted.some((m) => m.stage === 'attendance-already')).toBe(true)
    expect(anchors[0]._clicked).toBe(0)
    // postback を示す nav（メニュークリック）は出ていない
    expect(posted.some((m) => m.stage === 'attendance-click' || m.stage === 'menu-opened')).toBe(false)
  })

  it('受付フォーム(出席登録する＋認証コード)がある → URLが汎用でもメニューを叩かない', () => {
    const menuAnchor = anchor('モバイル出席登録', 'menuForm:mobileAttendance')
    const { posted, anchors } = runOpenAttendance({
      url: PORTAL_URL,
      anchors: [menuAnchor],
      body: '認証コードを入力してください',
      submitButtons: [submitBtn('出席登録する')],
    })
    expect(posted.some((m) => m.stage === 'attendance-already')).toBe(true)
    expect(anchors[0]._clicked).toBe(0)
  })

  it('未着地(ポータル・フォーム無し) → モバイル出席登録メニューを叩く（attendance-click）', () => {
    const menuAnchor = anchor('モバイル出席登録', 'menuForm:mobileAttendance')
    const { posted, anchors } = runOpenAttendance({
      url: PORTAL_URL,
      anchors: [menuAnchor],
      body: '出欠管理 メニュー',
    })
    expect(anchors[0]._clicked).toBe(1)
    expect(posted.some((m) => m.stage === 'attendance-click')).toBe(true)
    expect(posted.some((m) => m.stage === 'attendance-already')).toBe(false)
  })
})

describe('着地ガード回帰: 実URL・出席済みページ（実機採取 2026-07-17）', () => {
  // 実URL（アドレスバー実測）: 授業なし=xut113/Xut11301・授業あり=xut124/Xut12401。
  // 旧ガードは /xua001|Xua00101/ を見ていたため**実URLに一度も当たらず**、さらに出席済みだと
  // 認証コード欄も「出席登録する」も消えるため、着地しているのにメニューを叩き直していた。
  const REAL_ATTENDED_URL = 'https://class.admin.tus.ac.jp/uprx/up/xu/xut124/Xut12401.xhtml'

  it('出席済みページ（実URL Xut12401・フォーム無し・前の授業/次の授業あり）→ メニューを叩かない', () => {
    const menuAnchor = anchor('モバイル出席登録', 'menuForm:mobileAttendance')
    const { posted, anchors } = runOpenAttendance({
      url: REAL_ATTENDED_URL,
      anchors: [menuAnchor],
      body: '出席 リアクションペーパー提出済み',
      submitButtons: [submitBtn('前の授業'), submitBtn('次の授業'), submitBtn('再表示する')],
    })
    expect(posted.some((m) => m.stage === 'attendance-already')).toBe(true)
    expect(anchors[0]._clicked).toBe(0)
  })

  it('URLが汎用でも「前の授業/次の授業」があれば着地とみなす（不変マーカー）', () => {
    const menuAnchor = anchor('モバイル出席登録', 'menuForm:mobileAttendance')
    const { posted, anchors } = runOpenAttendance({
      url: PORTAL_URL,
      anchors: [menuAnchor],
      body: '出席',
      submitButtons: [submitBtn('前の授業'), submitBtn('次の授業')],
    })
    expect(posted.some((m) => m.stage === 'attendance-already')).toBe(true)
    expect(anchors[0]._clicked).toBe(0)
  })
})
