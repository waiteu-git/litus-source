import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { PressableRow } from '../ui/Pressable'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { useUi } from '../ui/screen'
import { dismissHint, visibleHint, type Hint, type HintKey } from './hints'
import { loadDismissedHints, mutateDismissedHints } from '../storage/dismissedHintsStore'

// ×の押せる範囲を約44×44へ（見た目は不変＝E0 H3）。上はカードの余白12、右は余白14の内側に収める＝カードの外へ
// 広げない（禁止事項2）。左の13は本文に重なるが、本文は押下対象ではない。
const DISMISS_HIT_SLOP = { top: 12, bottom: 14, left: 13, right: 13 } as const

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
    mutateDismissedHints((d) => dismissHint(d, hintKey)).catch(() => undefined)
  }, [hintKey])

  if (!hint) return null

  return (
    <View style={[ui.card, styles.card]}>
      <Ionicons name="bulb-outline" size={18} color={ui.accent} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: ui.valueColor }]}>{hint.title}</Text>
        <Text style={[styles.text, { color: ui.labelColor }]}>{hint.body}</Text>
      </View>
      <PressableRow onPress={onDismiss} hitSlop={DISMISS_HIT_SLOP} accessibilityRole="button" accessibilityLabel="ヒントを閉じる">
        <Ionicons name="close" size={18} color={ui.chevron} />
      </PressableRow>
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
