import { Pressable, StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from './Text'
import { useUi } from './screen'
import { joinA11yLabel } from './a11yState'

type IconName = keyof typeof Ionicons.glyphMap

/**
 * 低頻度項目を別画面へ送る概要行（アイコン＋タイトル＋サブタイトル＋chevron-forward）。
 * 見た目は SubjectDetailScreen の LinkAction と同じだが、読み上げ属性（accessibilityRole・
 * accessibilityLabel）を持つ点が異なる。既存の LinkAction 本体（LETUS/シラバス/課題追加の3箇所）は
 * 変えない（設計 docs/design/2026-09-13-settings-subject-declutter-design.md §6 Q4）。
 */
export function LinkRow({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: IconName
  title: string
  sub?: string
  onPress: () => void
}) {
  const ui = useUi()
  return (
    <Pressable
      style={[ui.card, styles.row]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={joinA11yLabel(title, sub)}
    >
      <View style={[styles.iconWrap, { backgroundColor: ui.softBoxBg }]}>
        <Ionicons name={icon} size={19} color={ui.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: ui.valueColor }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.sub, { color: ui.labelColor }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={ui.chevron} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '500' },
  sub: { fontSize: 12, marginTop: 2 },
})
