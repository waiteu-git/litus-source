import { describe, expect, it } from 'vitest'
import { nextBulletinWebStep, type BulletinWebSignal } from './bulletinWebFlow'

/** 既定は「ログイン後ポータル・掲示ページでない・モーダル未開・詳細未実行」。 */
function sig(over: Partial<BulletinWebSignal>): BulletinWebSignal {
  return {
    hasEnterSplash: false,
    onBulletinPage: false,
    modalOpen: false,
    detailFired: false,
    hasPasswordInput: false,
    hasMultiScreen: false,
    ...over,
  }
}

describe('nextBulletinWebStep', () => {
  it('入口スプラッシュ → PC ENTER で入場', () => {
    expect(nextBulletinWebStep(sig({ hasEnterSplash: true }))).toBe('enter')
  })

  it('ログイン後ポータル（掲示ページでない）→ 掲示板メニューを開く', () => {
    expect(nextBulletinWebStep(sig({}))).toBe('openMenu')
  })

  it('掲示ページ着地・詳細未実行 → 対象掲示を開く（一度だけ）', () => {
    expect(nextBulletinWebStep(sig({ onBulletinPage: true }))).toBe('openDetail')
  })

  it('掲示ページ着地・詳細実行済み → 何もしない（多重postback防止の要）', () => {
    expect(nextBulletinWebStep(sig({ onBulletinPage: true, detailFired: true }))).toBe('idle')
  })

  it('詳細モーダルが開いている → 何もしない（ユーザーが読む）', () => {
    expect(nextBulletinWebStep(sig({ onBulletinPage: true, modalOpen: true }))).toBe('idle')
  })

  it('ログイン画面 → 何もしない（可視ページなのでユーザーがログインする／再注入しない）', () => {
    expect(nextBulletinWebStep(sig({ hasPasswordInput: true }))).toBe('idle')
  })

  it('別の画面で操作された（競合）→ 何もしない（再注入で悪化させない）', () => {
    expect(nextBulletinWebStep(sig({ hasMultiScreen: true }))).toBe('idle')
  })

  it('競合はスプラッシュ判定より優先（競合ページでENTERを撃たない）', () => {
    expect(nextBulletinWebStep(sig({ hasMultiScreen: true, hasEnterSplash: true }))).toBe('idle')
  })

  it('掲示ページでも競合を観測したら idle（対象を開きに行かない）', () => {
    expect(nextBulletinWebStep(sig({ onBulletinPage: true, hasMultiScreen: true }))).toBe('idle')
  })
})
