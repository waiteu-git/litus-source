import { describe, expect, it } from 'vitest'
import { shouldCaptureSwipe, shouldCommitHide, clampSwipeX } from './swipeHideDecision'

describe('shouldCaptureSwipe', () => {
  it('横優勢で十分な移動なら捕捉', () => {
    expect(shouldCaptureSwipe(-30, 4)).toBe(true)
    expect(shouldCaptureSwipe(30, -4)).toBe(true)
  })
  it('縦優勢（スクロール）は捕捉しない', () => {
    expect(shouldCaptureSwipe(-20, 40)).toBe(false)
    expect(shouldCaptureSwipe(-14, 12)).toBe(false)
  })
  it('移動が小さいうちは捕捉しない', () => {
    expect(shouldCaptureSwipe(-8, 0)).toBe(false)
  })
})

describe('shouldCommitHide', () => {
  it('左へ十分引いたら確定', () => {
    expect(shouldCommitHide(-100, 0)).toBe(true)
  })
  it('速い左フリックは移動が浅くても確定', () => {
    expect(shouldCommitHide(-40, -0.5)).toBe(true)
  })
  it('浅い＋遅いはキャンセル', () => {
    expect(shouldCommitHide(-40, -0.1)).toBe(false)
  })
  it('右方向は確定しない', () => {
    expect(shouldCommitHide(120, 1)).toBe(false)
    expect(shouldCommitHide(40, -0.5)).toBe(false)
  })
})

describe('clampSwipeX', () => {
  it('右方向は0に固定', () => {
    expect(clampSwipeX(30, 300)).toBe(0)
  })
  it('左方向はそのまま、行幅超は抑制', () => {
    expect(clampSwipeX(-50, 300)).toBe(-50)
    expect(clampSwipeX(-400, 300)).toBe(-300)
  })
})
