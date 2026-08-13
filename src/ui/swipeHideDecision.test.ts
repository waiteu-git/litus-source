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

describe('捕捉しきい値＝「距離は小さく・比は強く」（縦スクロールとの取り合い）', () => {
  // 判別は **距離でなく比** に担わせる。capture 段でも、述語が真になるまでの移動はネイティブの
  // スクロールが食う＝距離で待つ形だと「待っている間に縦へ持っていかれる」（実機の症状は一貫して
  // 「左スワイプしようとすると画面が上下に動く」＝縦が勝つ側だった）。
  // 小さい距離で早く判断し、強い比で「明確に横」だけを拾う。
  it('明確に横なら浅い移動でも捕捉する（助走を見せない）', () => {
    expect(shouldCaptureSwipe(-10, 1)).toBe(true)
  })

  it('わずかでも斜めなら捕捉しない（比が効く）', () => {
    // 距離は十分でも縦成分が無視できないものは縦に渡す。
    expect(shouldCaptureSwipe(-30, 14)).toBe(false)
    expect(shouldCaptureSwipe(-30, 20)).toBe(false)
  })

  it('ごく小さい移動では判断しない（タップ・押下を奪わない）', () => {
    expect(shouldCaptureSwipe(-6, 0)).toBe(false)
  })
})
