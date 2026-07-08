import { useState, type ReactNode } from 'react'
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useUi } from './screen'
import { COLORS } from '../theme'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

type IconName = keyof typeof Ionicons.glyphMap

/** 折りたたみセクション。ヘッダ行タップで開閉（軽いLayoutAnimation付き）。 */
export function Accordion({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon?: IconName
  defaultOpen?: boolean
  children: ReactNode
}) {
  const ui = useUi()
  const [open, setOpen] = useState(defaultOpen)
  const headColor = ui.green ? COLORS.white : COLORS.emeraldDark
  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((o) => !o)
  }
  return (
    <View style={styles.wrap}>
      <Pressable style={[ui.card, styles.head]} onPress={toggle}>
        <View style={styles.headLeft}>
          {icon ? <Ionicons name={icon} size={18} color={headColor} /> : null}
          <Text style={[styles.title, { color: headColor }]}>{title}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={headColor} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '600' },
  body: { marginTop: 8, gap: 8 },
})
