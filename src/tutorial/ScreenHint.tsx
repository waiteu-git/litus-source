import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useUi } from '../ui/screen'
import { dismissHint, visibleHint, type Hint, type HintKey } from './hints'
import { loadDismissedHints, saveDismissedHints } from '../storage/dismissedHintsStore'

/**
 * 画面先頭に置く軽量ヒントカード。初回表示（未クローズ）のときだけ描画し、×で永続的に消える。
 * フォーカスごとに読み直す＝設定「ヒントを再表示」後に画面へ戻れば再び出る。
 * アニメは付けない（高頻度動線ほど動かさない方針。カードの出入りでレイアウトを揺らさない）。
 */
export default function ScreenHint({ hintKey }: { hintKey: HintKey }) {
  const ui = useUi()
  // null = 未ロード（フラッシュ防止のため何も出さない）。
  const [hint, setHint] = useState<Hint | null>(null)

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadDismissedHints()
        .then((d) => active && setHint(visibleHint(hintKey, d)))
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, [hintKey]),
  )

  const onDismiss = useCallback(() => {
    setHint(null)
    loadDismissedHints()
      .then((d) => saveDismissedHints(dismissHint(d, hintKey)))
      .catch(() => undefined)
  }, [hintKey])

  if (!hint) return null

  return (
    <View style={[ui.card, styles.card]}>
      <Ionicons name="bulb-outline" size={18} color={ui.accent} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: ui.valueColor }]}>{hint.title}</Text>
        <Text style={[styles.text, { color: ui.labelColor }]}>{hint.body}</Text>
      </View>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="ヒントを閉じる">
        <Ionicons name="close" size={18} color={ui.chevron} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  body: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  text: { fontSize: 12, lineHeight: 18 },
})
