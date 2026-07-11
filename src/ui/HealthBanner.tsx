import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { CollectionHealth } from '../health/collectionHealth'
import { healthBannerText, type HealthSource } from '../health/healthBannerText'
import { useUi } from './screen'

/**
 * 収集ヘルスの正直表示バナー（層1）。ok/empty_valid/blocked/未保存では何も描画しない。
 * 画面はキャッシュ表示を続け、このバナーだけで状態を伝える（空白/無限スピナーを出さない）。
 */
export default function HealthBanner({
  health,
  source,
}: {
  health: CollectionHealth | null | undefined
  source: HealthSource
}) {
  const ui = useUi()
  const text = healthBannerText(health, source)
  if (!text) return null
  return (
    <View style={[ui.card, styles.banner]}>
      <Ionicons name="information-circle-outline" size={16} color={ui.labelColor} />
      <Text style={[styles.text, { color: ui.valueColor }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  text: { fontSize: 12, flex: 1 },
})
