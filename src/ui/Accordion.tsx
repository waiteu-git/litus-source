import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useUi } from './screen'
import { DUR } from './motion'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

// 高さ開閉は transform に載らないため LayoutAnimation で担う（base=240ms・イーズインアウト）。
// 開閉と同時に create/delete も opacity で animate し、本文の出入りを滑らかにする。
const HEIGHT_ANIM = {
  duration: DUR.base,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
}

type IconName = keyof typeof Ionicons.glyphMap

/** 折りたたみセクション。ヘッダ行タップで開閉（高さ＝LayoutAnimation／chevron回転＋本文フェードで上品に）。 */
export function Accordion({
  title,
  icon,
  subtitle,
  right,
  defaultOpen = false,
  children,
}: {
  title: string
  icon?: IconName
  subtitle?: string
  right?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const ui = useUi()
  const [open, setOpen] = useState(defaultOpen)
  const headColor = ui.heading
  // chevron の回転（0→1 で 0→180度）。本文は開くたびに fast フェードイン。
  const rot = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current
  const bodyOpacity = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current

  function toggle() {
    const next = !open
    LayoutAnimation.configureNext(HEIGHT_ANIM)
    Animated.timing(rot, { toValue: next ? 1 : 0, duration: DUR.micro, useNativeDriver: true }).start()
    setOpen(next)
  }

  useEffect(() => {
    if (open) {
      bodyOpacity.setValue(0)
      Animated.timing(bodyOpacity, { toValue: 1, duration: DUR.fast, useNativeDriver: true }).start()
    }
  }, [open, bodyOpacity])

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })

  return (
    <View style={styles.wrap}>
      <Pressable style={[ui.card, styles.head]} onPress={toggle}>
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
        <Animated.View style={[styles.body, { opacity: bodyOpacity }]}>{children}</Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 2 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { marginTop: 8, gap: 8 },
})
