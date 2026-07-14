import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

/**
 * キーボード表示中の高さ(px)。非表示は0。
 * Android の RN Modal は Dialog ウィンドウで activity の adjustResize が効かず、
 * ボトムシート内の入力がキーボードに隠れる。この高さを sheet の marginBottom に足して持ち上げる。
 * RN 依存フックのため vitest 対象外（純ロジック無し）。
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates?.height ?? 0))
    const hideSub = Keyboard.addListener(hideEvt, () => setHeight(0))
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])
  return height
}
