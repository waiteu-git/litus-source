import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import type { FlagCache } from './a11yState'

/** 購読できる OS のアクセシビリティ設定（Reduce Motion）。 */
export type A11yFlagEvent = 'reduceMotionChanged'

/**
 * OS のアクセシビリティ設定を1つ購読する共通フック（useReducedMotion が使う）。
 * 初期値はキャッシュ（無ければ false）。値が解けた時と変わった時にキャッシュへ書く＝後からマウントする部品
 * （出席バナー・NowPulse など）が1フレーム目から正しい値で始まる（E0 §4-1・Q10）。永続化はしない。
 * ⚠ PanResponder と setInterval の中では戻り値を直接読まず、ref 経由で読むこと（初回に1回だけ作られるため）。
 */
export function useA11yFlag(cache: FlagCache, read: () => Promise<boolean>, event: A11yFlagEvent): boolean {
  const [value, setValue] = useState<boolean>(() => cache.get() ?? false)
  useEffect(() => {
    let alive = true
    read().then((v) => {
      cache.set(v)
      if (alive) setValue(v)
    })
    const sub = AccessibilityInfo.addEventListener(event, (v: boolean) => {
      cache.set(v)
      setValue(v)
    })
    return () => {
      alive = false
      sub.remove()
    }
  }, [cache, read, event])
  return value
}
