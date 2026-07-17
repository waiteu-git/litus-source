import { describe, expect, it } from 'vitest'
import { classifyClassPage } from './classifyClassPage'

const base = {
  hasPasswordInput: false,
  hasAttendanceForm: false,
  hasEnterSplash: false,
  hasClassMenu: false,
  hasSystemError: false,
}

describe('classifyClassPage', () => {
  it('パスワード欄があれば login（最優先）', () => {
    expect(classifyClassPage({ ...base, hasPasswordInput: true, hasClassMenu: true })).toBe('login')
  })
  it('出席フォームがあれば attendance', () => {
    expect(classifyClassPage({ ...base, hasAttendanceForm: true })).toBe('attendance')
  })
  it('ENTERスプラッシュは splash（URL直遷移で入場するため portal と区別）', () => {
    expect(classifyClassPage({ ...base, hasEnterSplash: true })).toBe('splash')
  })
  it('CLASSメニューありは portal', () => {
    expect(classifyClassPage({ ...base, hasClassMenu: true })).toBe('portal')
  })
  it('スプラッシュ判定はメニューより優先（両方立ったら splash）', () => {
    expect(classifyClassPage({ ...base, hasEnterSplash: true, hasClassMenu: true })).toBe('splash')
  })
  it('どれも無ければ other', () => {
    expect(classifyClassPage({ ...base })).toBe('other')
  })
  it('システムエラー文言があれば error（login以外に優先）', () => {
    expect(classifyClassPage({ ...base, hasSystemError: true, hasClassMenu: true })).toBe('error')
  })
  it('SSO stale（過去のリクエスト/CSRF）は error＝自動復帰対象（otherで行き止まりにしない）', () => {
    // これが無いと stale ページが other に落ち、booting のまま navFailed になる（本バグの発生源）。
    expect(classifyClassPage({ ...base, hasSsoStale: true })).toBe('error')
    // 出席ページURL上のstaleでも、検出(attendance)より先にerrorへ載せて取り直す。
    expect(
      classifyClassPage({
        ...base,
        hasSsoStale: true,
        url: 'https://class.admin.tus.ac.jp/uprx/up/xu/xua001/Xua00101.xhtml',
      }),
    ).toBe('error')
  })
  it('SSO staleでもパスワード欄(login)・多重画面(conflict)が優先', () => {
    expect(classifyClassPage({ ...base, hasSsoStale: true, hasPasswordInput: true })).toBe('login')
    expect(classifyClassPage({ ...base, hasSsoStale: true, hasMultiScreen: true })).toBe('conflict')
  })
  it('多重画面(PC競合)は conflict（system errorより優先・専用ハンドリング）', () => {
    expect(classifyClassPage({ ...base, hasMultiScreen: true, hasSystemError: true, hasClassMenu: true })).toBe('conflict')
  })
  it('多重画面でもパスワード欄(login)が最優先', () => {
    expect(classifyClassPage({ ...base, hasPasswordInput: true, hasMultiScreen: true })).toBe('login')
  })
  it('パスワード欄はエラーより優先（ログインページにエラー文言が乗っても login）', () => {
    expect(classifyClassPage({ ...base, hasPasswordInput: true, hasSystemError: true })).toBe('login')
  })
  it('MicrosoftログインURLは login（MS初画面はパスワード欄が無いためURLで判定）', () => {
    expect(
      classifyClassPage({ ...base, url: 'https://login.microsoftonline.com/common/oauth2/authorize' }),
    ).toBe('login')
  })
  it('出席ページURL(Xua00101)は受付フォームが無くても attendance（受付中の授業なしでもportal誤判定しない）', () => {
    // 受付中の授業が無いと出席ページにはフォームが無く hasClassMenu だけ立つ。URLで attendance と確定する。
    expect(
      classifyClassPage({
        ...base,
        hasClassMenu: true,
        url: 'https://class.admin.tus.ac.jp/uprx/up/xu/xua001/Xua00101.xhtml',
      }),
    ).toBe('attendance')
  })
  it('出席ページURLでもパスワード欄(セッション切れ)があれば login 優先', () => {
    expect(
      classifyClassPage({
        ...base,
        hasPasswordInput: true,
        url: 'https://class.admin.tus.ac.jp/uprx/up/xu/xua001/Xua00101.xhtml',
      }),
    ).toBe('login')
  })
})

describe('出席済み/受付なしの出席ページ（実機採取 2026-07-17）', () => {
  // 実URLは xua001 ではない: 授業なし=xut113/Xut11301・授業あり=xut124/Xut12401（アドレスバー実測）。
  // 画面に出る [Xua001] は**機能IDであってURLではない**。旧 isAttendanceUrl は実URLに当たらず、
  // 出席済み（フォームが消える）ページを portal と誤判定して navFailed に落としていた。
  const REAL_ATTENDED_URL = 'https://class.admin.tus.ac.jp/uprx/up/xu/xut124/Xut12401.xhtml'
  const REAL_NOCLASS_URL = 'https://class.admin.tus.ac.jp/uprx/up/xu/xut113/Xut11301.xhtml'
  const REAL_REACTION_URL = 'https://class.admin.tus.ac.jp/uprx/up/xu/xua001/Xua00102.xhtml'

  it('出席済みページ（フォーム無し・メニュー有り・実URL Xut12401）は attendance', () => {
    expect(
      classifyClassPage({
        ...base,
        hasAttendanceForm: false,
        hasClassMenu: true,
        hasAttendanceNav: true,
        url: REAL_ATTENDED_URL,
      }),
    ).toBe('attendance')
  })
  it('受付なしの出席ページ（実URL Xut11301）も attendance', () => {
    expect(
      classifyClassPage({ ...base, hasAttendanceForm: false, hasClassMenu: true, hasAttendanceNav: true, url: REAL_NOCLASS_URL }),
    ).toBe('attendance')
  })
  it('リアペページ（xua001配下）は attendance にしない＝前後ナビが無い', () => {
    expect(
      classifyClassPage({ ...base, hasAttendanceForm: false, hasClassMenu: true, hasAttendanceNav: false, url: REAL_REACTION_URL }),
    ).toBe('portal')
  })
  it('前後ナビが無く実URLでもない普通のポータルは portal のまま', () => {
    expect(
      classifyClassPage({ ...base, hasClassMenu: true, hasAttendanceNav: false, url: 'https://class.admin.tus.ac.jp/uprx/up/pk/pkx012/Pkx01201.xhtml' }),
    ).toBe('portal')
  })
})
