import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/** OSのReduce Motion設定を購読するフック。約15%のユーザーが有効化。 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduce(v)
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])
  return reduce
}
