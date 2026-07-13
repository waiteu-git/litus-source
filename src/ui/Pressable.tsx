import { useRef } from 'react'
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { DUR } from './motion'
import { useReducedMotion } from './useReducedMotion'
import { reducedPressScale } from './reducedMotion'

/** 押下フィードバックの正典値（motion.ts 割当表「押下: scale(0.97)+opacity0.92 / DUR.micro」）。 */
const PRESS_SCALE = 0.97
const PRESS_OPACITY = 0.92
/** スクロール誤発火回避のタップ確定遅延（80-120msの中間）。 */
const PRESS_DELAY_MS = 100

export type PressFeedbackProps = PressableProps & {
  style?: StyleProp<ViewStyle>
  /** 親ジェスチャ（Carousel等）が握っている間、押下演出とタップを無効化する口。 */
  disableGesture?: boolean
}

function usePressFeedback() {
  const reduce = useReducedMotion()
  const scale = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(1)).current
  const animate = (toScale: number, toOpacity: number) => {
    Animated.parallel([
      Animated.timing(scale, { toValue: toScale, duration: DUR.micro, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: toOpacity, duration: DUR.micro, useNativeDriver: true }),
    ]).start()
  }
  return {
    scale,
    opacity,
    onPressIn: () => animate(reducedPressScale(reduce, PRESS_SCALE), PRESS_OPACITY),
    onPressOut: () => animate(1, 1),
  }
}

function Feedback({ style, disableGesture, onPressIn: userPressIn, onPressOut: userPressOut, ...props }: PressFeedbackProps) {
  const { scale, opacity, onPressIn, onPressOut } = usePressFeedback()
  return (
    <Animated.View
      style={{ transform: [{ scale }], opacity }}
      pointerEvents={disableGesture ? 'none' : 'auto'}
    >
      <Pressable
        unstable_pressDelay={PRESS_DELAY_MS}
        onPressIn={(e) => { onPressIn(); userPressIn?.(e) }}
        onPressOut={(e) => { onPressOut(); userPressOut?.(e) }}
        style={style}
        {...props}
      />
    </Animated.View>
  )
}

/** カード面（アイデンティティ面/読書面）に押下応答を与える共通Pressable。 */
export function PressableCard(props: PressFeedbackProps) {
  return <Feedback {...props} />
}

/** 同種反復リストの行に押下応答を与える共通Pressable（PressableCardと同一挙動・意味論の別名）。 */
export function PressableRow(props: PressFeedbackProps) {
  return <Feedback {...props} />
}
