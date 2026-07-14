import { useRef, type ReactNode } from 'react'
import { Animated, PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from './Text'
import { useUi } from './screen'
import { shouldCaptureSwipe, shouldCommitHide, clampSwipeX } from './swipeHideDecision'

/**
 * 子（課題行）を左スワイプで非表示にするラッパー。左へ十分引く/速く弾くと onHide を呼ぶ。
 * 縦スクロールとは shouldCaptureSwipe（横優勢判定）で分離する。タップ/押下は子(PressableRow)に委ねる。
 * 背後の赤アクションはスワイプ量に連動してフェードイン＝翠テーマのガラス行(半透明)でも静止時は透けない。
 */
export function SwipeToHide({
  children,
  onHide,
  radius = 0,
  style,
}: {
  children: ReactNode
  onHide: () => void
  /** 背後アクション層の角丸（前景カードと一致させる。フラット行=18・区切り行=0）。 */
  radius?: number
  /** 外側ラッパーのスタイル（行間マージン等をここに置くと背後層が前景と同じ高さになる）。 */
  style?: StyleProp<ViewStyle>
}) {
  const ui = useUi()
  const tx = useRef(new Animated.Value(0)).current
  const widthRef = useRef(0)
  const onHideRef = useRef(onHide)
  onHideRef.current = onHide

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => shouldCaptureSwipe(g.dx, g.dy),
      onPanResponderMove: (_e, g) => {
        tx.setValue(clampSwipeX(g.dx, widthRef.current))
      },
      onPanResponderRelease: (_e, g) => {
        if (shouldCommitHide(g.dx, g.vx)) {
          Animated.timing(tx, {
            toValue: -(widthRef.current || 400),
            duration: 160,
            useNativeDriver: true,
          }).start(() => onHideRef.current())
        } else {
          Animated.spring(tx, { toValue: 0, useNativeDriver: true, friction: 9, tension: 90 }).start()
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(tx, { toValue: 0, useNativeDriver: true, friction: 9, tension: 90 }).start()
      },
    }),
  ).current

  const behindOpacity = tx.interpolate({ inputRange: [-80, -8, 0], outputRange: [1, 0, 0], extrapolate: 'clamp' })

  return (
    <View style={style} onLayout={(e) => (widthRef.current = e.nativeEvent.layout.width)}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.behind,
          { backgroundColor: ui.colors.dangerBg, opacity: behindOpacity, borderRadius: radius },
        ]}
      >
        <Ionicons name="eye-off-outline" size={16} color={ui.colors.danger} />
        <Text style={[styles.behindText, { color: ui.colors.danger }]}>非表示</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: tx }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  behind: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 20, gap: 6 },
  behindText: { fontSize: 12, fontWeight: '600' },
})
