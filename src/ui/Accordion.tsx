import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View, type AccessibilityActionEvent } from 'react-native'
import { Text } from './Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useUi } from './screen'
import { RADIUS, SPACE } from './scale'
import { DUR } from './motion'
import { useReducedMotion } from './useReducedMotion'
import { disclosureA11yProps } from './disclosureA11y'
import { findExtraAction, joinA11yLabel, mergeA11yActions, type A11yExtraAction } from './a11yState'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

// 高さ開閉は transform に載らないため LayoutAnimation で担う（base=240ms・イーズインアウト）。Reduce Motion では呼ばない（E0 M8）。
// 開閉と同時に create/delete も opacity で animate し、本文の出入りを滑らかにする。
const HEIGHT_ANIM = {
  duration: DUR.base,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
}

type IconName = keyof typeof Ionicons.glyphMap

/**
 * 折りたたみセクション。ヘッダ行タップで開閉（高さ＝LayoutAnimation／chevron回転＋本文フェードで上品に）。
 * 読み上げ（E0 A3）: 開閉は disclosureA11yProps を通す（iOS は値「展開中／折りたたみ中」、Android は expanded と
 * 今の状態に合う操作1つ）。名前の既定は title と subtitle を「、」でつないだもの（right の文言は混ぜない）。
 * 見出しは1つの読み上げ要素になり right に入れ子にしたボタンへ iOS では届かないので、a11yActions で見出しの操作として出す。
 * Reduce Motion（E0 M8）: 高さのアニメを呼ばず、山括弧は即座に反転する。本文の fade は変位でないので残す。
 */
export function Accordion({
  title,
  icon,
  subtitle,
  right,
  defaultOpen = false,
  accessibilityLabel,
  a11yActions,
  children,
}: {
  title: string
  icon?: IconName
  subtitle?: string
  right?: ReactNode
  defaultOpen?: boolean
  /** 見出しの読み上げ名。既定は title と subtitle を「、」でつないだもの。 */
  accessibilityLabel?: string
  /** 見出しに入れ子になった操作を、見出し自身の読み上げ操作として出す（例: 各回の予定の「予定を追加」）。 */
  a11yActions?: ReadonlyArray<A11yExtraAction>
  children: ReactNode
}) {
  const ui = useUi()
  const [open, setOpen] = useState(defaultOpen)
  const reduce = useReducedMotion()
  const headColor = ui.heading
  // chevron の回転（0→1 で 0→180度）。本文は開くたびに fast フェードイン。
  const rot = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current
  const bodyOpacity = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current

  function toggle() {
    const next = !open
    if (reduce) {
      // Reduce Motion: 高さのアニメを呼ばず、山括弧は即座に反転（M8）。toggle は描画ごとに作り直すので reduce は最新。
      rot.setValue(next ? 1 : 0)
    } else {
      LayoutAnimation.configureNext(HEIGHT_ANIM)
      Animated.timing(rot, { toValue: next ? 1 : 0, duration: DUR.micro, useNativeDriver: true }).start()
    }
    setOpen(next)
  }

  useEffect(() => {
    if (open) {
      bodyOpacity.setValue(0)
      Animated.timing(bodyOpacity, { toValue: 1, duration: DUR.fast, useNativeDriver: true }).start()
    }
  }, [open, bodyOpacity])

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })
  const disclosure = disclosureA11yProps(open, toggle)
  const extras = a11yActions ?? []
  const actions = mergeA11yActions(disclosure.accessibilityActions ?? [], extras)

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[ui.card, styles.head, open && styles.headOpen]}
        onPress={toggle}
        {...disclosure}
        accessibilityLabel={accessibilityLabel ?? joinA11yLabel(title, subtitle)}
        accessibilityActions={actions.length > 0 ? actions : undefined}
        onAccessibilityAction={(e: AccessibilityActionEvent) => {
          const extra = findExtraAction(e.nativeEvent.actionName, extras)
          if (extra) extra.onAction()
          else disclosure.onAccessibilityAction?.(e)
        }}
      >
        <View style={styles.headLeft}>
          {icon ? <Ionicons name={icon} size={18} color={headColor} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: headColor }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: ui.labelColor }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headRight}>
          {right}
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="chevron-down" size={18} color={headColor} />
          </Animated.View>
        </View>
      </Pressable>
      {open ? (
        <Animated.View
          style={[
            styles.body,
            {
              opacity: bodyOpacity,
              borderLeftColor: ui.colors.cardBorder,
              borderRightColor: ui.colors.cardBorder,
              borderBottomColor: ui.colors.cardBorder,
              borderTopColor: ui.dividerColor,
            },
          ]}
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: SPACE.s6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 2 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: RADIUS.card,
    borderBottomRightRadius: RADIUS.card,
    paddingHorizontal: SPACE.s4,
    paddingTop: SPACE.s2,
    paddingBottom: SPACE.s4,
    gap: SPACE.s2,
  },
})
