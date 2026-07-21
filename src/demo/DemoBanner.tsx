import { Pressable, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui/Text'
import { useUi } from '../ui/screen'
import { useDemo } from './DemoProvider'

/**
 * デモ表示中であることの常時表示バー。KillSwitchBanner と同型。
 *
 * 常時出すのは、①審査員が「今見ているのはサンプルデータ」と誤認しないため
 * ②実ユーザーが誤ってデモに入った場合に即座に気づけるため。
 * 色だけに頼らずアイコンと文言を併用する（デザイン規約: 色単独禁止）。
 */
export function DemoBanner() {
  const ui = useUi()
  const insets = useSafeAreaInsets()
  const { exit } = useDemo()
  return (
    <View style={[ui.card, styles.banner, { marginTop: insets.top + 6 }]}>
      <Ionicons name="information-circle-outline" size={16} color={ui.labelColor} />
      <Text style={[styles.text, { color: ui.valueColor }]}>
        デモ表示中です。実際のデータではありません。
      </Text>
      <Pressable onPress={exit} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.exit, { color: ui.accent }]}>終了</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 14,
    marginBottom: 6,
  },
  text: { fontSize: 12, flex: 1 },
  exit: { fontSize: 12, fontWeight: '700' },
})
