import { useMemo, useRef, type ReactNode } from 'react'
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderHandlers,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from './Text'
import { useUi } from './screen'
import { shouldCaptureSwipe, shouldCommitHide, clampSwipeX } from './swipeHideDecision'

/**
 * 課題行の左スワイプ非表示。**PanResponder は行の中ではなくリストを包む側（ホスト）に置く。**
 *
 * ⚠**iOS ではこの構造だけが動く。しきい値をどう触っても代わりにならない。**
 * `RCTScrollViewComponentView.mm` の `_shouldDisableScrollInteraction` は
 * 「JS が responder を取ったか」を **ScrollView 自身の祖先方向にしか探さない**:
 *
 *     UIView *ancestorView = self.superview;
 *     while (ancestorView) { if (isJSResponder) return YES; ancestorView = ancestorView.superview; }
 *     return NO;
 *
 * そして `touchesShouldCancelInContentView:` はその否定を返す。行の中に PanResponder を置くと
 * 行は ScrollView の**子孫**なのでこの探索に永久にヒットせず、UIScrollView は縦に動き出した
 * 瞬間に content のタッチを**キャンセル**する。JS 側は `onPanResponderTerminate` を受けて行を
 * 0 へ戻す＝実機の症状「掴めるのに上下に取られて戻る／掴み直しが要る」そのものになる。
 *
 * JS 側の逃げ道は無い:
 * - `onShouldBlockNativeResponder` は **iOS では捨てられる**（Fabric の
 *   `RCTMountingManager setIsJSResponder:blockNativeResponder:` は引数を受け取るだけで使わず、
 *   Paper の `RCTUIManager setJSResponder:blockNativeResponder:` は `__unused`）。既定で true なので
 *   指定しても何も変わらない。
 * - `onPanResponderTerminationRequest` は **JS 側の responder 交渉にしか効かない**。
 *   ネイティブ由来の `touchesCancelled` は止められない。
 *
 * 動いている対照が同じリポにある＝`TimetableScreen` の曜日スワイプは
 * `<View {...swipePan.panHandlers}><ScrollView>…` と**包む形**で書かれており、こちらは効いている。
 * 効く／効かないの差はしきい値（24px と 8px）ではなく**この構造**だった。
 */
export type SwipeTarget = {
  tx: Animated.Value
  width: () => number
  hide: () => void
}

export type SwipeHideHost = {
  /** **リストを包む View** に展開する。行の中に置くと上記の理由で iOS で機能しない。 */
  panHandlers: GestureResponderHandlers
  /** 行が capture 段で「いま触られているのは自分」と登録する。 */
  claim: (target: SwipeTarget) => void
}

const SPRING_BACK = { toValue: 0, useNativeDriver: true, friction: 9, tension: 90 } as const

/** リスト側に置くスワイプの司令塔。触られている行を1つだけ憶えて駆動する。 */
export function useSwipeHideHost(): SwipeHideHost {
  const active = useRef<SwipeTarget | null>(null)
  const pan = useRef(
    PanResponder.create({
      // 新しいタッチのたびに対象を捨てる。**capture 段はホスト→行の順に走る**ので、
      // この直後に触られた行が自分を claim する。逆順（バブル段）だと前回の行が残り、
      // 見出しや「非表示」行を触ってから横に引くと**関係ない行が動く**。
      // 返り値 false ＝ responder は取らない（タップ・長押しは子の Pressable のまま）。
      onStartShouldSetPanResponderCapture: () => {
        active.current = null
        return false
      },
      // 掴む判定は行が登録済みのときだけ。見出し・「非表示」行の上での横引きは素通しになる。
      onMoveShouldSetPanResponderCapture: (_e, g) => active.current != null && shouldCaptureSwipe(g.dx, g.dy),
      // 掴んだ後は JS 側の横取りを許さない。
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        const t = active.current
        if (t) t.tx.setValue(clampSwipeX(g.dx, t.width()))
      },
      onPanResponderRelease: (_e, g) => {
        const t = active.current
        active.current = null
        if (!t) return
        if (shouldCommitHide(g.dx, g.vx)) {
          Animated.timing(t.tx, { toValue: -(t.width() || 400), duration: 160, useNativeDriver: true }).start(() =>
            t.hide(),
          )
        } else {
          Animated.spring(t.tx, SPRING_BACK).start()
        }
      },
      onPanResponderTerminate: () => {
        const t = active.current
        active.current = null
        if (t) Animated.spring(t.tx, SPRING_BACK).start()
      },
    }),
  ).current
  return useMemo(
    () => ({
      panHandlers: pan.panHandlers,
      claim: (t: SwipeTarget) => {
        active.current = t
      },
    }),
    [pan],
  )
}

/**
 * 子（課題行）を左スワイプで非表示にするラッパー。判定と駆動は `host` が持つ。
 * 背後の赤アクションはスワイプ量に連動してフェードイン＝翠テーマのガラス行(半透明)でも静止時は透けない。
 */
export function SwipeToHide({
  children,
  onHide,
  host,
  radius = 0,
  style,
}: {
  children: ReactNode
  onHide: () => void
  /** `useSwipeHideHost()` の戻り値。リストを包む View に `panHandlers` を展開しておくこと。 */
  host: SwipeHideHost
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

  const target = useRef<SwipeTarget>({
    tx,
    width: () => widthRef.current,
    hide: () => onHideRef.current(),
  }).current

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
      <Animated.View
        style={{ transform: [{ translateX: tx }] }}
        // **capture 段**で登録する。バブル段（onStartShouldSetResponder）だと子の Pressable が
        // 先に responder を取って伝播が止まり、ここまで来ない。false ＝ responder は取らない。
        onStartShouldSetResponderCapture={() => {
          host.claim(target)
          return false
        }}
      >
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  behind: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 20, gap: 6 },
  behindText: { fontSize: 12, fontWeight: '600' },
})
