import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'
import { COLORS } from '../theme'
import { useReducedMotion } from './useReducedMotion'
import { AMBIENT_STATIC_FRAME, shouldAnimateAmbient } from './reducedMotion'

/**
 * モダンな「実施中（ライブ）」インジケータ。小さな実点がゆっくり脈打つ（呼吸する）だけの控えめな表現。
 * 波紋を広げない設計なので、狭いグリッドセル内でもクリップされず綺麗に収まる。
 * Reduce Motion オンの時はループを始めず、中間フレーム（拡大1.28・不透明）で止める（E0 M1）。毎周期すでに
 * 描かれている姿なので新しい見た目を作らない。時間割グリッドと、Badge の live 経由のリストの「実施中」の2箇所に効く。
 */
export function NowPulse({ size = 8, color = COLORS.cta }: { size?: number; color?: string }) {
  const reduce = useReducedMotion()
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!shouldAnimateAmbient(reduce)) {
      pulse.setValue(AMBIENT_STATIC_FRAME)
      return
    }
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
  }, [pulse, reduce])
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
