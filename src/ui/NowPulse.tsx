import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'
import { COLORS } from '../theme'

/**
 * モダンな「実施中（ライブ）」インジケータ。小さな実点がゆっくり脈打つ（呼吸する）だけの控えめな表現。
 * 波紋を広げない設計なので、狭いグリッドセル内でもクリップされず綺麗に収まる。
 */
export function NowPulse({ size = 8, color = COLORS.cta }: { size?: number; color?: string }) {
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  const scale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.28, 1] })
  const opacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.55, 1, 0.55] })
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ scale }],
        opacity,
      }}
    />
  )
}
