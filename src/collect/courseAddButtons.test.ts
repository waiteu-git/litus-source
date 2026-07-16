import { describe, expect, it } from 'vitest'
import { INJECT_COURSE_ADD_BUTTONS_JS, markActivityAddedJs } from './injectedScripts'

/**
 * コースページ「＋追加」注入ボタンの回帰ガード。
 * touchend はスクロールジェスチャ（指の移動後）でも発火するため、ボタンに登録すると
 * 「軽く触れただけで追加される」誤タップの原因になる（2026-07-16実バグ）。
 * タップ判定は click（ブラウザのスロップ判定つき）だけに固定する。
 */
describe('INJECT_COURSE_ADD_BUTTONS_JS', () => {
  it('touchend/touchstart をボタンに登録しない（スクロール誤タップの再発防止）', () => {
    expect(INJECT_COURSE_ADD_BUTTONS_JS).not.toMatch(/addEventListener\(\s*'touch/)
  })

  it('click を捕捉相で登録する', () => {
    expect(INJECT_COURSE_ADD_BUTTONS_JS).toContain("addEventListener('click', onAdd, true)")
  })

  it('ボタンに data-litus-add-url を持たせ、確定反映ヘルパー __litusMarkAdded を定義する', () => {
    expect(INJECT_COURSE_ADD_BUTTONS_JS).toContain('data-litus-add-url')
    expect(INJECT_COURSE_ADD_BUTTONS_JS).toContain('__litusMarkAdded')
  })

  it('タップ時に楽観的な「追加済み」化をしない（確定はRN側からの注入で行う）', () => {
    // onAdd 内で textContent を書き換えない＝「追加済み」文言は __litusMarkAdded 側だけに現れる
    const onAddBody = INJECT_COURSE_ADD_BUTTONS_JS.match(/function onAdd\(ev\)\{[\s\S]*?\n      \}/)?.[0] ?? ''
    expect(onAddBody).not.toContain('追加済み')
  })
})

describe('markActivityAddedJs', () => {
  it('URLをJSONエスケープして __litusMarkAdded を呼ぶJSを返す', () => {
    const js = markActivityAddedJs('https://letus.ed.tus.ac.jp/mod/assign/view.php?id=123')
    expect(js).toContain('__litusMarkAdded')
    expect(js).toContain('"https://letus.ed.tus.ac.jp/mod/assign/view.php?id=123"')
    expect(js.trim().endsWith('true;')).toBe(true)
  })

  it('引用符やバックスラッシュを含むURLでも構文を壊さない', () => {
    const js = markActivityAddedJs('https://x/a?q="\'\\')
    expect(js).toContain(JSON.stringify('https://x/a?q="\'\\'))
  })
})
