import { StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { CELEBRATION_COPY } from '../celebration/celebration'
import { celebrationColors, type CelebrationVariant } from '../theme.celebration'

/**
 * 起動画面（ロゴの上の空き）に出す、お祝いの静止した2行。
 * ロゴ列（WebView・縦中央寄せ）の流れの外に絶対配置する＝boltRise の 121.2px（列の高さの実測値）を変えない。
 * 日本語はアプリ共通フォント（IBM Plex Sans JP）で確実に揃う RN の Text で描く（埋め込みフォントは漢字を持たない）。
 * 静止＝動かない（「祝福は 360ms 上限・2箇所限定」の規約に抵触しない）。フォント拡大でもロゴ列に被らないよう上限を付ける。
 */
export function BootCelebration({ variant, topInset }: { variant: CelebrationVariant; topInset: number }) {
  const c = celebrationColors(variant)
  return (
    <View
      style={[styles.wrap, { top: topInset + 28 }]}
      pointerEvents="none"
      accessible
      accessibilityLabel={`${CELEBRATION_COPY.bootTitle}。${CELEBRATION_COPY.bootName}`}
    >
      <Text maxFontSizeMultiplier={1.2} style={[styles.title, { color: c.bootTitle }]}>
        {CELEBRATION_COPY.bootTitle}
      </Text>
      <Text maxFontSizeMultiplier={1.2} style={[styles.name, { color: c.bootName }]}>
        {CELEBRATION_COPY.bootName}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
  title: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  name: { marginTop: 2, fontSize: 12, textAlign: 'center' },
})
