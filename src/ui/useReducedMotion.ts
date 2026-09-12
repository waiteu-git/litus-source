import { AccessibilityInfo } from 'react-native'
import { createFlagCache } from './a11yState'
import { useA11yFlag } from './useA11yFlag'

const cache = createFlagCache()
const read = () => AccessibilityInfo.isReduceMotionEnabled()

/**
 * OS の Reduce Motion（iOS「視差効果を減らす」／Android「アニメーションを削除」＝TRANSITION_ANIMATION_SCALE が0）を
 * 購読するフック。初期値は最後に分かった値（起動直後に最初にマウントする部品だけ false で始まる＝E0 Q10）。
 * Android はアプリ復帰時に再評価されて通知が来る（F25）。
 * ⚠ PanResponder と setInterval の中では直接読まず ref 経由で読む（E0 禁止事項3）。
 */
export function useReducedMotion(): boolean {
  return useA11yFlag(cache, read, 'reduceMotionChanged')
}
