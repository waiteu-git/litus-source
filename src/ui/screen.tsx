import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORS, useThemeVariant } from '../theme'

/** 全画面共通の背景（テーマに応じて翠グラデ or 薄地）。中身は padding 済みの領域。 */
export function ScreenBg({ children }: { children: ReactNode }) {
  const { variant } = useThemeVariant()
  if (variant === 'glass') {
    return (
      <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={ui.root}>
        {children}
      </LinearGradient>
    )
  }
  return <View style={[ui.root, { backgroundColor: COLORS.tint }]}>{children}</View>
}

/** ヘッダー行（アイコン＋タイトル＋右側のアクションチップ群）。 */
export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { variant } = useThemeVariant()
  const color = variant === 'glass' ? COLORS.white : COLORS.emeraldDark
  return (
    <View style={ui.header}>
      <Text style={[ui.hTitle, { color }]}>{title}</Text>
      {right ? <View style={ui.headerRight}>{right}</View> : null}
    </View>
  )
}

/** 押せる翠チップ（ヘッダーのアクション用）。 */
export function Chip({ label, onPress }: { label: string; onPress?: () => void }) {
  const { variant } = useThemeVariant()
  const glass = variant === 'glass'
  return (
    <Pressable style={glass ? ui.chipGlass : ui.chipSolid} onPress={onPress}>
      <Text style={{ color: glass ? '#04322a' : COLORS.emeraldDark, fontSize: 12 }}>{label}</Text>
    </Pressable>
  )
}

/** セクション見出し（薄い翠ラベル）。 */
export function SectionLabel({ children }: { children: ReactNode }) {
  const { variant } = useThemeVariant()
  const color = variant === 'glass' ? '#eafff7' : COLORS.emeraldDark
  return <Text style={[ui.section, { color }]}>{children}</Text>
}

/** 選択ピル（曜日・学期・テーマ切替などに共通利用）。テーマに応じて配色を出し分ける。 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (k: T) => void
}) {
  const { variant } = useThemeVariant()
  const glass = variant === 'glass'
  return (
    <View style={ui.segRow}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[
              ui.seg,
              { borderColor: glass ? 'rgba(255,255,255,0.4)' : '#cfe0d9' },
              on
                ? glass
                  ? { backgroundColor: 'rgba(255,255,255,0.7)', borderColor: 'transparent' }
                  : { backgroundColor: COLORS.emerald, borderColor: 'transparent' }
                : null,
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: on ? '600' : '400',
                color: on ? (glass ? '#04322a' : COLORS.white) : glass ? '#eafff7' : COLORS.emeraldDark,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** テーマ別のスタイル片を返すフック（画面側で自由に組む）。 */
export function useUi() {
  const { variant } = useThemeVariant()
  const glass = variant === 'glass'
  return {
    glass,
    card: glass ? ui.cardGlass : ui.cardSolid,
    labelColor: glass ? COLORS.labelOnGlass : COLORS.emeraldDark,
    valueColor: glass ? COLORS.inkOnGlass : COLORS.ink,
    dividerColor: glass ? 'rgba(255,255,255,0.35)' : '#e3ece8',
  }
}

const ui = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 14, paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  hTitle: { fontSize: 20, fontWeight: '600' },
  headerRight: { flexDirection: 'row', gap: 6 },
  chipGlass: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipSolid: {
    backgroundColor: '#d6efe4',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  section: { fontSize: 12, fontWeight: '500', marginTop: 14, marginBottom: 8, marginLeft: 2 },
  segRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 11, borderWidth: 1 },
  cardGlass: {
    backgroundColor: 'rgba(255,255,255,0.36)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 14,
    padding: 13,
  },
  cardSolid: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#e3ece8',
    borderRadius: 14,
    padding: 13,
  },
})
