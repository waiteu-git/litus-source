import { StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { Ionicons } from '@expo/vector-icons'
import { useKillSwitch } from '../health/KillSwitchProvider'
import type { KillSwitchFeature } from '../health/killSwitch'
import { useUi } from './screen'

/**
 * 機能別kill switchの停止バナー（HealthBannerと同型）。停止中でなければ何も描画しない。
 * 画面はキャッシュ表示を続け、このバナーだけで「一時停止中」を伝える。
 */
export default function KillSwitchBanner({ feature }: { feature: KillSwitchFeature }) {
  const ui = useUi()
  const { status, isKilled } = useKillSwitch()
  if (!isKilled(feature)) return null
  const base = 'この機能は現在一時停止中のためご利用いただけません。'
  const text = status?.message ? `${base}\n${status.message}` : base
  return (
    <View style={[ui.card, styles.banner]}>
      <Ionicons name="pause-circle-outline" size={16} color={ui.labelColor} />
      <Text style={[styles.text, { color: ui.valueColor }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  text: { fontSize: 12, flex: 1 },
})
