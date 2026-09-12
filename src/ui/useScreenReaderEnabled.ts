import { AccessibilityInfo } from 'react-native'
import { createFlagCache } from './a11yState'
import { useA11yFlag } from './useA11yFlag'

const cache = createFlagCache()
const read = () => AccessibilityInfo.isScreenReaderEnabled()

/**
 * 読み上げ（VoiceOver／TalkBack）が動いているかを購読するフック（useReducedMotion と同じ形）。
 * カルーセルが読み上げ中に自動送りしないために使う（E0 S1）。
 * ⚠ PanResponder と setInterval の中では直接読まず ref 経由で読む。
 */
export function useScreenReaderEnabled(): boolean {
  return useA11yFlag(cache, read, 'screenReaderChanged')
}
