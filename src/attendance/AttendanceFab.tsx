import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../ui/Text'
import { useUi, useTabBarClearance } from '../ui/screen'
import { useAttendanceEngine } from './AttendanceEngineProvider'
import { computeHomeBanner } from './homeBanner'
import { navigationRef, requestOpenAttendance } from '../navigation/navigationRef'
import { COLORS } from '../theme'
import { loadTimetableOverrides, loadCurrentQuarter } from '../storage/timetableOverridesStore'
import { applyQuarterOverrides, resolveCurrentQuarter, type TimetableOverrides } from '../timetableEvents/quarter'
import type { Quarter } from '../parsers/timetable'

// FABを出さない画面: ホーム(HomeHome)=独自の出席バナーを持つ、出席(Attendance)=遷移先自身、
// 全画面ビューア(Web/PdfViewer/Link)=下部にボタンがありピルが被る（RootTabs の hideOn と同じ集合）。
const HIDDEN_ROUTES: ReadonlySet<string> = new Set(['HomeHome', 'Attendance', 'Web', 'PdfViewer', 'Link'])

/**
 * 全画面共通の出席フローティングボタン。受付中／授業時間帯にタブバー上へ小さなピルを出し、
 * タップで出席画面へ遷移する。表示条件はホームのバナーと同じ純粋関数 computeHomeBanner に委譲する。
 * - エンジン停止中は reception が陳腐化するため信頼しない（授業時間帯判定のみに委ねる）。
 * - 出席済みでは出さない（案内が不要）。
 * - ホーム（独自バナー）と出席画面自身では出さない（重複・自己言及を避ける）。
 */
export default function AttendanceFab() {
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { reception, timetable, running, attendedNow } = useAttendanceEngine()
  // 授業時間帯（class-time）判定のための分クロック（秒精度は不要）。
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 60000)
    return () => clearInterval(id)
  }, [])
  // 積みコマ（半期科目）の代表選択用。前半/後半の手動指定(override)と「今が前半/後半か」の手動指定。
  const [ttOverrides, setTtOverrides] = useState<TimetableOverrides>({})
  const [ttQuarterPref, setTtQuarterPref] = useState<Quarter | null>(null)
  useEffect(() => {
    loadTimetableOverrides().then(setTtOverrides).catch(() => undefined)
    loadCurrentQuarter().then(setTtQuarterPref).catch(() => undefined)
  }, [])
  // 現在ルート名。ナビ状態変化で追随し、ホーム/出席画面では隠す。
  const [routeName, setRouteName] = useState<string | undefined>(undefined)
  useEffect(() => {
    const update = () => setRouteName((navigationRef.getCurrentRoute() as { name?: string } | undefined)?.name)
    update()
    const unsub = navigationRef.addListener('state', update)
    return unsub
  }, [])

  const ttQ = timetable.map((c) => ({ ...c, slots: applyQuarterOverrides(c.slots, ttOverrides) }))
  const cq = resolveCurrentQuarter(ttQuarterPref, tick)
  const raw = computeHomeBanner(ttQ, running ? reception : null, tick, cq)
  const active = raw.active && !attendedNow
  if (!active || (routeName != null && HIDDEN_ROUTES.has(routeName))) return null

  const accepting = raw.kind === 'accepting'
  const bg = accepting
    ? ui.pick(COLORS.cta, COLORS.cta, COLORS.emerald)
    : ui.pick(COLORS.emerald, COLORS.emerald, COLORS.emeraldLight)
  return (
    // box-none: ピル以外のタップは下の画面へ通す（全画面を覆うが操作は奪わない）。
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: clearance - 6 }]}>
      <Pressable
        onPress={() => requestOpenAttendance()}
        style={({ pressed }) => [styles.pill, { backgroundColor: bg }, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={accepting ? '出席受付中。タップで出席へ' : '出席を確認。タップで出席へ'}
      >
        <Ionicons name="flash" size={15} color={COLORS.white} />
        <Text style={styles.text} numberOfLines={1}>
          {accepting ? '出席受付中' : '出席を確認'}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={COLORS.white} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: COLORS.emeraldDark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  text: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
})
