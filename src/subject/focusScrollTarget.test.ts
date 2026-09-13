import { describe, it, expect } from 'vitest'
import { nextFocusScroll, initialFocusScrollState, type FocusScrollState } from './focusScrollTarget'

describe('nextFocusScroll', () => {
  it('未計測（null）ならスクロールしない', () => {
    expect(nextFocusScroll(initialFocusScrollState, null)).toBeNull()
  })

  it('初回の計測でスクロールする（offset分だけ上に余白を残す）', () => {
    expect(nextFocusScroll(initialFocusScrollState, 420)).toEqual({ scrollTo: 408, lastY: 420 })
  })

  it('y が offset より小さくても負のスクロール位置を返さない', () => {
    expect(nextFocusScroll(initialFocusScrollState, 5)).toEqual({ scrollTo: 0, lastY: 5 })
  })

  it('同じ y が再度来ても二度目はスクロールしない（陰性対照）', () => {
    const after: FocusScrollState = { lastY: 420, userScrolled: false }
    expect(nextFocusScroll(after, 420)).toBeNull()
  })

  // 本命の回帰: データ到着でレイアウトが確定し目標セクションが下へ動いたら、追従して測り直す。
  // 「一度スクロールしたら二度と再計算しない」実装ではここが null になり、focus:'pattern' が
  // 出欠の各回リストの途中に着地する（データ未到着時の小さいレイアウトで確定してしまうため）。
  it('データ到着で y が変わったら再スクロールする', () => {
    const after: FocusScrollState = { lastY: 120, userScrolled: false }
    expect(nextFocusScroll(after, 640)).toEqual({ scrollTo: 628, lastY: 640 })
  })

  it('ユーザーが手動スクロールした後は y が変わっても画面を奪わない', () => {
    const dragged: FocusScrollState = { lastY: 120, userScrolled: true }
    expect(nextFocusScroll(dragged, 640)).toBeNull()
    expect(nextFocusScroll({ lastY: null, userScrolled: true }, 640)).toBeNull()
  })
})
