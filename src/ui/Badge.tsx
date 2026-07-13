import { View, StyleSheet } from 'react-native'
import { Text } from './Text'
import { NowPulse } from './NowPulse'
import { COLORS } from '../theme.palette'
import { RADIUS } from './scale'
import { badgeCountLabel } from './badgeLabel'

/**
 * 件数バッジ（未読/新着）とライブバッジ（今の授業/実施中）の統合。色はCTA固定（現行4箇所と同じ慣行）。
 * live の size: 'md'=ホーム相当(padH9/font11)、'sm'=時間割グリッド相当(padH8/font10)。
 * 既存 nowLiveText の fontWeight:'800' は虚偽指定（Plexは700まで）のため '700' に是正。
 */
export function Badge(
  props:
    | { variant: 'count'; label: string; count?: number }
    | { variant: 'live'; label: string; size?: 'sm' | 'md' },
) {
  if (props.variant === 'live') {
    const sm = props.size === 'sm'
    return (
      <View style={[styles.liveBase, { paddingHorizontal: sm ? 8 : 9 }]}>
        <NowPulse size={6} color={COLORS.white} />
        <Text style={[styles.liveText, { fontSize: sm ? 10 : 11 }]}>{props.label}</Text>
      </View>
    )
  }
  return (
    <View style={styles.count}>
      <Text style={styles.countText}>{badgeCountLabel(props.label, props.count)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  count: { backgroundColor: COLORS.cta, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 },
  countText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  liveBase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.cta,
    borderRadius: RADIUS.pill,
    paddingVertical: 3,
  },
  liveText: { color: COLORS.white, fontWeight: '700', letterSpacing: 0.3 },
})
