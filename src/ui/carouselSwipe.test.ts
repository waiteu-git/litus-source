import { describe, expect, it } from 'vitest'
import { classifySwipe, shouldCaptureSwipe, stepIndex, SWIPE_DISTANCE, SWIPE_SLOP } from './carouselSwipe'

describe('stepIndex', () => {
  it('前進で次のインデックスに進む', () => {
    expect(stepIndex(0, 1, 3)).toBe(1)
    expect(stepIndex(1, 1, 3)).toBe(2)
  })
  it('末尾から前進すると先頭へ折り返す', () => {
    expect(stepIndex(2, 1, 3)).toBe(0)
  })
  it('後退で前のインデックスに戻る', () => {
    expect(stepIndex(2, -1, 3)).toBe(1)
  })
  it('先頭から後退すると末尾へ折り返す', () => {
    expect(stepIndex(0, -1, 3)).toBe(2)
  })
  it('要素が1件以下なら動かない', () => {
    expect(stepIndex(0, 1, 1)).toBe(0)
    expect(stepIndex(0, -1, 1)).toBe(0)
    expect(stepIndex(0, 1, 0)).toBe(0)
  })
  it('範囲外の現在値でも配列内に収まる（items縮小の瞬間対策）', () => {
    expect(stepIndex(5, 1, 3)).toBe(0)
    expect(stepIndex(5, -1, 3)).toBe(1)
  })
})

describe('classifySwipe', () => {
  it('左スワイプ（負のdxが閾値超え）は next', () => {
    expect(classifySwipe(-SWIPE_DISTANCE)).toBe('next')
    expect(classifySwipe(-120)).toBe('next')
  })
  it('右スワイプ（正のdxが閾値超え）は prev', () => {
    expect(classifySwipe(SWIPE_DISTANCE)).toBe('prev')
    expect(classifySwipe(120)).toBe('prev')
  })
  it('閾値未満はスワイプ扱いしない（タップに譲る）', () => {
    expect(classifySwipe(0)).toBeNull()
    expect(classifySwipe(SWIPE_DISTANCE - 1)).toBeNull()
    expect(classifySwipe(-(SWIPE_DISTANCE - 1))).toBeNull()
  })
})

describe('shouldCaptureSwipe', () => {
  it('横移動がスロップ超えかつ縦より優勢ならキャプチャ', () => {
    expect(shouldCaptureSwipe(SWIPE_SLOP + 1, 0)).toBe(true)
    expect(shouldCaptureSwipe(-(SWIPE_SLOP + 1), 3)).toBe(true)
  })
  it('スロップ以内はタップとして子Pressableに譲る', () => {
    expect(shouldCaptureSwipe(SWIPE_SLOP, 0)).toBe(false)
    expect(shouldCaptureSwipe(0, 0)).toBe(false)
  })
  it('縦移動が優勢なら奪わない（縦スクロールと共存）', () => {
    expect(shouldCaptureSwipe(SWIPE_SLOP + 5, SWIPE_SLOP + 20)).toBe(false)
  })
})
