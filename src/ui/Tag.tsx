import { View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from './Text'
import { useUi } from './screen'
import { RADIUS } from './scale'
import { tagRoleColors, tagSizeStyle, type TagRole, type TagSize } from './tagRole'

type IconName = keyof typeof Ionicons.glyphMap

/**
 * カテゴリ/意味色タグ（掲示・課題画面のピル4重複を統合）。
 * role='neutral' が現行ピル（ui.pillBg/pillText）と互換。
 * 意味色role（danger/warn/info/success）は「色が付いている＝異常」＝色単独禁止のため icon 併用を推奨。
 */
export function Tag({
  label,
  role = 'neutral',
  size = 'md',
  icon,
}: {
  label: string
  role?: TagRole
  size?: TagSize
  icon?: IconName
}) {
  const ui = useUi()
  const { bg, text } = tagRoleColors(ui.colors, role)
  const s = tagSizeStyle(size)
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: RADIUS.pill,
        paddingHorizontal: s.padH,
        paddingVertical: s.padV,
        backgroundColor: bg,
      }}
    >
      {icon ? <Ionicons name={icon} size={s.fontSize + 1} color={text} /> : null}
      <Text style={{ fontSize: s.fontSize, fontWeight: s.fontWeight, color: text }}>{label}</Text>
    </View>
  )
}
