import { StyleSheet, Text } from 'react-native'
import { formatFreshness } from '../health/freshnessText'
import { useUi } from './screen'

/**
 * 「HH:mm時点の情報」を控えめに常設表示する小部品。at=0（未収集）や無効値では描画しない。
 * キャッシュ閲覧保証の一環として、いつ取得した情報かを常に伝える。
 */
export default function FreshnessLabel({ at }: { at: number }) {
  const ui = useUi()
  const text = formatFreshness(at, new Date())
  if (!text) return null
  return <Text style={[styles.text, { color: ui.labelColor }]}>{text}</Text>
}

const styles = StyleSheet.create({
  text: { fontSize: 11, marginBottom: 8, marginLeft: 2 },
})
