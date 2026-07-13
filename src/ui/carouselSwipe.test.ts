import { describe, expect, it } from 'vitest'
import {
  classifySwipe,
  shouldCaptureSwipe,
  stepIndex,
  SWIPE_DISTANCE,
  SWIPE_SLOP,
  SWIPE_VELOCITY,
} from './carouselSwipe'

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
  it('左スワイプ（負のdxが確定距離超え）は +1＝次へ', () => {
    expect(classifySwipe(-SWIPE_DISTANCE, 0)).toBe(1)
    expect(classifySwipe(-120, 0)).toBe(1)
  })
  it('右スワイプ（正のdxが確定距離超え）は -1＝前へ', () => {
    expect(classifySwipe(SWIPE_DISTANCE, 0)).toBe(-1)
    expect(classifySwipe(120, 0)).toBe(-1)
  })
  it('距離不足かつ低速はスワイプ扱いしない', () => {
    expect(classifySwipe(0, 0)).toBeNull()
    expect(classifySwipe(SWIPE_DISTANCE - 1, 0)).toBeNull()
    expect(classifySwipe(-(SWIPE_DISTANCE - 1), 0)).toBeNull()
  })
  it('距離不足でも速いフリックはスワイプ確定（キャプチャ済みタップの死にゾーン縮小）', () => {
    expect(classifySwipe(-(SWIPE_SLOP + 5), -SWIPE_VELOCITY)).toBe(1)
    expect(classifySwipe(SWIPE_SLOP + 5, SWIPE_VELOCITY)).toBe(-1)
  })
  it('速くても移動がスロップ以内なら確定しない', () => {
    expect(classifySwipe(-SWIPE_SLOP, -1)).toBeNull()
    expect(classifySwipe(SWIPE_SLOP, 1)).toBeNull()
  })
  it('速度と移動の向きが食い違うフリックは確定しない（行って戻る指）', () => {
    expect(classifySwipe(-(SWIPE_SLOP + 5), SWIPE_VELOCITY)).toBeNull()
    expect(classifySwipe(SWIPE_SLOP + 5, -SWIPE_VELOCITY)).toBeNull()
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
