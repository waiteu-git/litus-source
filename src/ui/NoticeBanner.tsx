import { Pressable, StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from './Text'
import { COLORS } from '../theme'
import { openLitusSite } from './openLitusSite'

/**
 * 運用お知らせ帯。KillSwitchProvider（LoginGate の外側）が描画する。
 * ログインできない・画面が進まない層こそ一番届けたい相手なので、ホーム内には置かない。
 * 表示するか否かの判定は持たず（src/health/notice.ts の resolveNotice が決める）、
 * ここは見た目だけを担う。
 *
 * ⚠ **全幅の自前地色バーにしている**（DemoBanner のような余白つきカードではない）。
 * この帯は children を押し下げるので、カード型にすると上端に地色の帯が残る。そこは
 * NavigationContainer の地色で、**下の画面と一致しない**（実機で確認: variant が white でも
 * 規約画面は自前の翠グラデを敷くため、白帯が翠の上に乗って見えた）。下に何が来るか分からない
 * 以上、帯自身が上端まで塗り切るのが唯一破綻しない形。
 *
 * 色だけに頼らずアイコンと文言を併用する（デザイン規約: 色単独禁止）。
 */
export function NoticeBanner({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
      <Pressable
        style={styles.row}
        onPress={openLitusSite}
        accessibilityRole="link"
        accessibilityLabel={`お知らせ: ${text}`}
        accessibilityHint="リタスのサイトを開きます"
      >
        <Ionicons name="megaphone-outline" size={16} color={COLORS.white} />
        <Text style={styles.text}>{text}</Text>
        {/* タップで開けることの手がかり（帯全体が押せるので独立した Pressable にはしない）。 */}
        <Text style={styles.more}>詳しく</Text>
        <Ionicons name="chevron-forward" size={14} color={COLORS.white} />
      </Pressable>
      <Pressable
        onPress={onDismiss}
        hitSlop={10}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="お知らせを閉じる"
      >
        <Ionicons name="close" size={18} color={COLORS.white} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.emeraldDark,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  text: { color: COLORS.white, fontSize: 12, lineHeight: 18, flex: 1 },
  more: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  close: { paddingLeft: 4 },
})
