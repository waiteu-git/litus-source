import { Linking, Pressable, StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { useThemeVariant } from '../theme'
import { useUi } from '../ui/screen'
import { PressableRow } from '../ui/Pressable'
import { celebrationColors } from '../theme.celebration'
import { CELEBRATION_COPY, CELEBRATION_LINK_URL } from '../celebration/celebration'
import { useCelebration } from '../celebration/CelebrationProvider'
import { CelebrationMark } from '../celebration/CelebrationMark'

/**
 * ホーム最上段のお祝いカード（アイデンティティ面＝**標準のガラスカード**に象牙の縁）。オフ・期限後・読み込み前・×で閉じた後は何も描かない。
 * 地を淡い黄みにしない（警告面と見分けがつかず「色が付いている＝異常」と読み違える）。文字は標準の ink/label。
 *
 * - 事実は大学の公式発表に語らせる: リンク先は大学の発表ページ（外部ブラウザで開く）。アプリ内 WebView は
 *   大学のログインの Cookie を共有するので、公開ページでも使わない（links/externalLink.ts の注意）。
 * - 色だけに頼らない: アイコン＋文言（「色が付いている＝異常」の規約）。
 * - 非公式であることをカード内に明記する。
 * - 右上の×で閉じられる（ScreenHint と同じ形・押せる範囲を約44x44へ）。閉じた記録は保存され、次の起動でも閉じたまま。
 *   設定でオフ→オンへ戻すと、また出る。起動画面の飾りと見出しの線は設定どおりで、×では消えない。
 */
// ×の押せる範囲を約44x44へ（見た目は不変）。ScreenHint の DISMISS_HIT_SLOP と同じ。
const DISMISS_HIT_SLOP = { top: 12, bottom: 14, left: 13, right: 13 } as const

export function CelebrationCard() {
  const { cardVisible, dismissCard } = useCelebration()
  const { variant } = useThemeVariant()
  const ui = useUi()
  if (!cardVisible) return null
  const c = celebrationColors(variant)
  return (
    <View style={[ui.card, styles.card, { borderColor: c.cardBorder }]}>
      <View style={styles.icon}>
        <CelebrationMark variant={variant} size={40} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.headline, { color: ui.valueColor }]}>{CELEBRATION_COPY.cardHeadline}</Text>
        <Pressable
          onPress={() => {
            Linking.openURL(CELEBRATION_LINK_URL).catch(() => undefined)
          }}
          accessibilityRole="link"
          accessibilityLabel={CELEBRATION_COPY.cardLinkA11y}
          hitSlop={8}
          style={styles.linkRow}
        >
          <Text style={[styles.link, { color: ui.valueColor }]}>{CELEBRATION_COPY.cardLinkLabel}</Text>
          <Ionicons name="open-outline" size={14} color={ui.valueColor} />
        </Pressable>
        <Text style={[styles.note, { color: ui.labelColor }]}>{CELEBRATION_COPY.cardNote}</Text>
      </View>
      <PressableRow
        onPress={dismissCard}
        hitSlop={DISMISS_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={CELEBRATION_COPY.cardDismissA11y}
        style={styles.dismiss}
      >
        <Ionicons name="close" size={18} color={ui.chevron} />
      </PressableRow>
    </View>
  )
}

const styles = StyleSheet.create({
  // 地・角丸・padding・borderWidth は ui.card（標準のガラスカード）。ここは並びと下の余白だけ。
  card: { flexDirection: 'row', marginBottom: 10 },
  icon: { marginRight: 12 },
  body: { flex: 1 },
  // 右上。本文の幅を食わない小さな×（見た目は ScreenHint と同じ 18px のアイコン）。
  dismiss: { marginLeft: 10 },
  headline: { fontSize: 14, fontWeight: '500', lineHeight: 21 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, minHeight: 32 },
  link: { fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },
  note: { fontSize: 11, lineHeight: 16, marginTop: 4 },
})
