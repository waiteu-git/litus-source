import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, G } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, DARK, useThemeVariant } from '../theme'
import { resolveUiColors } from '../theme.tokens'
import { DUR, EASE } from './motion'

type IconName = keyof typeof Ionicons.glyphMap

/** 浮遊タブバー（position:absolute）の高さ＋下マージン分。スクロール内容の末尾がピルに隠れない退避量。 */
export const TAB_BAR_CLEARANCE = 74

/** タブバーのピルを避けるための下部退避量（セーフエリア込み）。スクロールの contentContainerStyle に足す。 */
export function useTabBarClearance() {
  const insets = useSafeAreaInsets()
  return Math.max(insets.bottom, 8) + TAB_BAR_CLEARANCE
}

/**
 * 全画面共通の背景（テーマに応じて翠グラデ or 薄地）。上部はセーフエリア分を確保。
 * **背景は全高で描き、下部余白は入れない**（浮遊タブバーの背後までアプリ画面が透ける）。
 * コンテンツがピルに隠れないための退避は各スクロールの contentContainerStyle 側（useTabBarClearance）で行う。
 */
export function ScreenBg({ children }: { children: ReactNode }) {
  const { variant } = useThemeVariant()
  const c = resolveUiColors(variant)
  const insets = useSafeAreaInsets()
  const pad = { paddingTop: insets.top + 10 }
  // gradient を持つ variant（翠・暗）はグラデ地、白は単色地。
  if (c.gradient) {
    return (
      <LinearGradient colors={c.gradient} style={[ui.root, pad]}>
        {children}
      </LinearGradient>
    )
  }
  return <View style={[ui.root, pad, { backgroundColor: c.screenSolid }]}>{children}</View>
}

/** ヘッダー行（アイコン＋タイトル＋右側のアクションチップ群）。 */
export function ScreenHeader({ title, icon, right }: { title: string; icon?: IconName; right?: ReactNode }) {
  const { variant } = useThemeVariant()
  const color = resolveUiColors(variant).heading
  return (
    <View style={ui.header}>
      <View style={ui.hLeft}>
        {icon ? <Ionicons name={icon} size={22} color={color} /> : null}
        <Text style={[ui.hTitle, { color }]}>{title}</Text>
      </View>
      {right ? <View style={ui.headerRight}>{right}</View> : null}
    </View>
  )
}

/** 押せる翠チップ（ヘッダーのアクション用）。任意で先頭アイコン。 */
export function Chip({ label, icon, onPress }: { label: string; icon?: IconName; onPress?: () => void }) {
  const { variant } = useThemeVariant()
  const c = resolveUiColors(variant)
  const color = c.chipText
  return (
    <Pressable
      style={[ui.chipBase, ui.chipRow, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}
      onPress={onPress}
    >
      {icon ? <Ionicons name={icon} size={14} color={color} /> : null}
      <Text style={{ color, fontSize: 12 }}>{label}</Text>
    </Pressable>
  )
}

/** 翠塗りのアクションボタン（収集画面などの操作用）。 */
export function ActionButton({ label, onPress, ghost }: { label: string; onPress?: () => void; ghost?: boolean }) {
  const { variant } = useThemeVariant()
  const green = variant === 'green'
  const dark = variant === 'dark'
  if (ghost) {
    return (
      <Pressable
        style={[ui.action, { backgroundColor: green ? 'rgba(255,255,255,0.5)' : dark ? DARK.softBox : '#dce9e3' }]}
        onPress={onPress}
      >
        <Text style={[ui.actionText, { color: dark ? COLORS.emeraldLight : COLORS.emeraldDark }]}>{label}</Text>
      </Pressable>
    )
  }
  return (
    <Pressable style={ui.action} onPress={onPress}>
      <Text style={ui.actionText}>{label}</Text>
    </Pressable>
  )
}

/** セクション見出し（薄い翠ラベル）。 */
export function SectionLabel({ children }: { children: ReactNode }) {
  const { variant } = useThemeVariant()
  const color = variant === 'green' ? '#eafff7' : variant === 'dark' ? DARK.label : COLORS.emeraldDark
  return <Text style={[ui.section, { color }]}>{children}</Text>
}

/** 選択ピル（曜日・学期・テーマ切替・表示形式切替などに共通利用）。テーマに応じて配色を出し分ける。 */
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
  const c = resolveUiColors(variant)
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
              { borderColor: c.segBorder },
              on ? { backgroundColor: c.segOnBg, borderColor: 'transparent' } : null,
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: on ? '600' : '400',
                color: on ? c.segOnText : c.segOffText,
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

export type StepState = 'done' | 'active' | 'error' | 'pending'
export type Step = { label: string; sub?: string; state: StepState }

/**
 * 収集フローなどの縦タイムライン進捗（Turn3で確定した3b案）。
 * ドット色: done=翠 / active=cta / error=赤 / pending=グレー。線は前段のdoneを引き継いで繋がる。
 */
export function StepList({ steps }: { steps: Step[] }) {
  const ui2 = useUi()
  const { variant } = useThemeVariant()
  const green = variant === 'green'
  const trackColor = green ? 'rgba(255,255,255,0.22)' : variant === 'dark' ? 'rgba(255,255,255,0.12)' : '#e3ece8'
  return (
    <View>
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        const dotBg =
          s.state === 'done' ? COLORS.emerald : s.state === 'active' ? COLORS.cta : s.state === 'error' ? COLORS.danger : trackColor
        return (
          <View key={i} style={ui.stepRow}>
            <View style={ui.stepDotCol}>
              <View style={[ui.stepDot, { backgroundColor: dotBg }]}>
                {s.state === 'done' ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
                {s.state === 'error' ? <Ionicons name="close" size={14} color="#ffffff" /> : null}
                {s.state === 'active' ? <View style={ui.stepDotInner} /> : null}
              </View>
              {!last ? (
                <View style={[ui.stepLine, { backgroundColor: s.state === 'done' ? COLORS.emerald : trackColor }]} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: s.state === 'pending' ? '400' : '600',
                  color: s.state === 'pending' ? ui2.labelColor : ui2.valueColor,
                }}
              >
                {s.label}
              </Text>
              {s.sub ? (
                <Text style={{ fontSize: 12, marginTop: 3, color: s.state === 'error' ? COLORS.danger : ui2.labelColor }}>
                  {s.sub}
                </Text>
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

/**
 * 出席のライブ状態を大きく見せる円形バッジ（Turn1で確定した1d案）。実際の残り秒から動的な弧を
 * 描くにはSVG依存が要るため、意図的に円周は装飾（固定リング）にとどめ、中央の大きな数値/文言で
 * 情報量を担保する。センターは countdownText() 等の結果をそのまま渡す想定。
 */
/**
 * 残り時間リング。progress(0..1) に応じて緑の弧が動く（軽いトラック＋丸端アーク・SVG）。
 * progress 省略時は満弧（装飾）。中央のカウントダウンは1行に収める（adjustsFontSizeToFit）。
 */
export function CountdownRing({
  centerText,
  subText,
  size = 176,
  accent,
  progress,
}: {
  centerText: string
  subText?: string
  size?: number
  accent?: string
  progress?: number
}) {
  const { variant } = useThemeVariant()
  const green = variant === 'green'
  const dark = variant === 'dark'
  const stroke = 12
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const p = progress == null ? 1 : Math.max(0, Math.min(1, progress))
  const cx = size / 2
  const arcColor = accent ?? (green ? '#ffffff' : dark ? COLORS.emeraldLight : COLORS.cta)
  const trackColor = green ? 'rgba(255,255,255,0.22)' : dark ? 'rgba(255,255,255,0.12)' : '#e3ebe7'
  const textColor = green ? '#ffffff' : dark ? DARK.heading : COLORS.emeraldDark
  const subColor = green ? '#eafff7' : dark ? DARK.label : '#8a968f'
  return (
    <View style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={cx} cy={cx} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <G rotation={-90} originX={cx} originY={cx}>
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            stroke={arcColor}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - p)}
          />
        </G>
      </Svg>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontSize: 36, fontWeight: '700', color: textColor, paddingHorizontal: 14, textAlign: 'center' }}
      >
        {centerText}
      </Text>
      {subText ? <Text style={{ fontSize: 13, marginTop: 4, color: subColor }}>{subText}</Text> : null}
    </View>
  )
}

/**
 * 不定進捗バー（indeterminate）。進捗率が不明な待機中に、細いトラックの上を明色セグメントが
 * 左→右へ連続でスイープし「処理中でありフリーズしていない」ことを明示する。translateX のみで
 * useNativeDriver に載せる。トラック幅は onLayout で実測してからループを開始する。
 */
export function IndeterminateBar({
  color,
  trackColor,
  height = 4,
}: {
  color: string
  trackColor: string
  height?: number
}) {
  const [w, setW] = useState(0)
  const x = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (w <= 0) return
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 1100, easing: EASE.move, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [w, x])
  const seg = Math.max(48, w * 0.4)
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-seg, Math.max(w, seg)] })
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }}
    >
      {w > 0 ? (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: seg,
            borderRadius: height / 2,
            backgroundColor: color,
            transform: [{ translateX }],
          }}
        />
      ) : null}
    </View>
  )
}

/** カルーセルのアクティブドット（幅 6⇄18px を micro でアニメ。色は cta/薄地で出し分け）。 */
function CarouselDot({ active, inactiveColor }: { active: boolean; inactiveColor: string }) {
  const w = useRef(new Animated.Value(active ? 18 : 6)).current
  useEffect(() => {
    Animated.timing(w, { toValue: active ? 18 : 6, duration: DUR.micro, easing: EASE.move, useNativeDriver: false }).start()
  }, [active, w])
  return (
    <Animated.View
      style={[ui.dot, { width: w, backgroundColor: active ? COLORS.cta : inactiveColor }]}
    />
  )
}

/**
 * 汎用の自動スライドカルーセル（一定間隔でクロスディゾルブ）。インフォタブのCLASS掲示など、
 * 今後アイテム数が増減するモジュールをそのまま差し替えられるよう中身は ReactNode[] で受け取る。
 * 切替は旧スライドの exit フェードと新スライドの enter フェード＋微ドリフト(6→0)を重ね、空白を作らない。
 */
export function Carousel({ items, intervalMs = 4000 }: { items: ReactNode[]; intervalMs?: number }) {
  const [idx, setIdx] = useState(0)
  // 出ていく旧スライドを重ねるためのオーバーレイ（クロスディゾルブ中だけ描画）。
  const [outgoing, setOutgoing] = useState<{ node: ReactNode; key: number } | null>(null)
  const inOpacity = useRef(new Animated.Value(1)).current
  const inShift = useRef(new Animated.Value(0)).current
  const outOpacity = useRef(new Animated.Value(0)).current
  // setInterval クロージャの陳腐化を避けるため、最新の items と idx を ref で参照する。
  const itemsRef = useRef(items)
  itemsRef.current = items
  const idxRef = useRef(idx)
  idxRef.current = idx

  useEffect(() => {
    if (items.length <= 1) return
    const id = setInterval(() => {
      const list = itemsRef.current
      const cur = idxRef.current
      const next = (cur + 1) % list.length
      setOutgoing({ node: list[cur], key: cur })
      outOpacity.setValue(1)
      inOpacity.setValue(0)
      inShift.setValue(6)
      setIdx(next)
      // 旧スライドは新より速く抜く（fast<base）。同じ長さでクロスフェードすると新旧が重なって
      // 半透明で二重に見え「前の掲示が消えるのが遅く見づらい」ため、旧を先に消して重なりを減らす。
      Animated.parallel([
        Animated.timing(outOpacity, { toValue: 0, duration: DUR.fast, easing: EASE.exit, useNativeDriver: true }),
        Animated.timing(inOpacity, { toValue: 1, duration: DUR.base, easing: EASE.enter, useNativeDriver: true }),
        Animated.timing(inShift, { toValue: 0, duration: DUR.base, easing: EASE.enter, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setOutgoing(null)
      })
    }, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, intervalMs])
  useEffect(() => {
    if (idx >= items.length) setIdx(0)
  }, [items.length, idx])
  const { variant } = useThemeVariant()
  const dotInactive =
    variant === 'green' ? 'rgba(255,255,255,0.45)' : variant === 'dark' ? 'rgba(255,255,255,0.2)' : '#cfe0d9'
  return (
    <View>
      <View>
        {/* 新スライドは通常フローで高さを決める（enter フェード＋6→0ドリフト）。 */}
        <Animated.View style={{ opacity: inOpacity, transform: [{ translateY: inShift }] }}>
          {items[idx] ?? null}
        </Animated.View>
        {/* 旧スライドは絶対配置で重ね、exit フェードで抜ける（空白を作らない）。 */}
        {outgoing ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: outOpacity }]}>
            {outgoing.node}
          </Animated.View>
        ) : null}
      </View>
      {items.length > 1 ? (
        <View style={ui.dotsRow}>
          {items.map((_, i) => (
            <CarouselDot key={i} active={i === idx} inactiveColor={dotInactive} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

/**
 * テーマ別の色トークン片を返すフック（画面側で自由に組む）。翠/白/暗の3variantを解決する。
 * green/white の値は従来と一致（回帰なし）、dark のみ実配色を新規に返す。
 * `pick(green, white, dark)` は個別画面の一点物の色を variant で出し分ける補助。
 */
export function useUi() {
  const { variant } = useThemeVariant()
  const c = resolveUiColors(variant)
  const green = variant === 'green'
  const dark = variant === 'dark'
  return {
    variant,
    green,
    dark,
    pick: <T,>(greenVal: T, whiteVal: T, darkVal: T): T => (green ? greenVal : dark ? darkVal : whiteVal),
    card: { backgroundColor: c.cardBg, borderColor: c.cardBorder, borderWidth: 1, borderRadius: 18, padding: 14 },
    labelColor: c.labelColor,
    valueColor: c.valueColor,
    dividerColor: c.dividerColor,
    heading: c.heading,
    accent: c.accent,
    accentSoft: c.accentSoft,
    pillBg: c.pillBg,
    pillText: c.pillText,
    softBoxBg: c.softBoxBg,
    chevron: c.chevron,
    subMuted: c.subMuted,
    inputBg: c.inputBg,
    inputBorder: c.inputBorder,
    colors: c,
  }
}

const ui = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  hLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  hTitle: { fontSize: 20, fontWeight: '600' },
  headerRight: { flexDirection: 'row', gap: 6 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  action: { backgroundColor: COLORS.emerald, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center' },
  actionText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
  chipBase: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  section: { fontSize: 12, fontWeight: '500', marginTop: 14, marginBottom: 8, marginLeft: 2 },
  segRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 16, borderWidth: 1 },
  cardGlass: {
    backgroundColor: 'rgba(255,255,255,0.36)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 18,
    padding: 14,
  },
  cardSolid: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#e3ece8',
    borderRadius: 18,
    padding: 14,
  },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepDotCol: { alignItems: 'center' },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepDotInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#ffffff' },
  stepLine: { width: 2, flex: 1, minHeight: 20, marginVertical: 4 },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 10, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
})
