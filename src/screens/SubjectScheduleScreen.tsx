import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { useRoute, type RouteProp } from '@react-navigation/native'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import type { TimetableStackParamList } from '../navigation/types'
import { nextFocusScroll, initialFocusScrollState, type FocusScrollState } from '../subject/focusScrollTarget'
import { loadAttendanceStats } from '../storage/attendanceStatsStore'
import type { AttendanceMark } from '../parsers/attendanceStats'
import type { AttendanceCourseStats } from '../parsers/attendanceStats'
import { loadAttendanceOverrides, saveAttendanceOverride } from '../storage/attendanceOverridesStore'
import { computeAttendanceRisk, type AttendanceRisk } from '../attendance/attendanceRisk'
import { useAttendanceVersion } from '../attendance/attendanceVersion'
import { resolveTermDates, termWeeksFromSessions, deriveExcludedDates } from '../attendance/attendanceTerm'
import { loadWeeklyPatterns, saveWeeklyPattern } from '../storage/weeklyPatternStore'
import {
  mondayOf,
  weekMondayKey,
  isWeekOff,
  toggleWeek,
  applyBiweeklyPreset,
  clearPattern,
  weekList,
  type WeeklyPattern,
} from '../timetableEvents/weeklyPattern'

// 各回リストの区分表示（CLASS凡例の記号＋文言。色単独禁止＝欠席の赤にも×と文言を必ず併記）。
// SubjectDetailScreen.tsx の MARK_LABEL と同一（出欠の描画は両画面から独立して行うため写しを持つ）。
const MARK_LABEL: Record<AttendanceMark, string> = {
  present: '〇 出席',
  absent: '× 欠席',
  late: '△ 遅刻',
  earlyLeave: '▽ 早退',
  official: '公欠',
  canceled: '休講',
  notInScope: '対象外',
  examNotInScope: '試験対象外',
  none: '未記録',
}

/**
 * 出欠の詳細（各回記録・総回数調整）と実施パターン編集を1画面にまとめた低頻度項目の別画面。
 * SubjectDetailScreen の「出欠」「実施パターン」概要行はどちらもこの画面を開き、focus で
 * 初期スクロール位置を決める。データは SubjectDetailScreen と独立に読み込む（CLASSへの通信は
 * 発生しない AsyncStorage 読み取りのみのため、二重読み込みのコストは無視できる＝設計からの調整1）。
 * 画面タイトルは TimetableStack.tsx の static な title オプションが唯一の定義（画面側で
 * navigation.setOptions を呼ぶと同じ値の二重定義になる）。
 * 設計: docs/design/2026-09-13-settings-subject-declutter-design.md §4.2
 */
export default function SubjectScheduleScreen() {
  const route = useRoute<RouteProp<TimetableStackParamList, 'SubjectSchedule'>>()
  const { courseCode, name, focus } = route.params
  const ui = useUi()
  const clearance = useTabBarClearance()

  const [pattern, setPattern] = useState<WeeklyPattern>({})
  const [attStats, setAttStats] = useState<AttendanceCourseStats | null>(null)
  const [attTotal, setAttTotal] = useState<number | null>(null)
  const [attCollected, setAttCollected] = useState(true)
  const { version: attVersion } = useAttendanceVersion()

  // セクションの y 座標を onLayout で記録し、focus に応じてスクロールする
  // （measureLayout より単純で、両OSで挙動が揃う）。null は「まだ計測できていない」を表す。
  // 一度きりで確定させず、目標セクションの y が変わるたびに追従する（判定と理由は
  // src/subject/focusScrollTarget.ts。データが初回レイアウトより後に届くため）。
  const attendanceY = useRef<number | null>(null)
  const patternY = useRef<number | null>(null)
  const focusScroll = useRef<FocusScrollState>(initialFocusScrollState)
  const scrollRef = useRef<ScrollView>(null)

  function maybeScrollToFocus() {
    const y = focus === 'attendance' ? attendanceY.current : patternY.current
    const next = nextFocusScroll(focusScroll.current, y)
    if (!next) return
    focusScroll.current = { ...focusScroll.current, lastY: next.lastY }
    scrollRef.current?.scrollTo({ y: next.scrollTo, animated: false })
  }

  useEffect(() => {
    loadWeeklyPatterns()
      .then((m) => setPattern(m[courseCode] ?? {}))
      .catch(() => undefined)
  }, [courseCode])

  useEffect(() => {
    ;(async () => {
      const data = await loadAttendanceStats()
      setAttCollected(data !== null)
      const found = data?.courses.find((c) => c.courseCode === courseCode) ?? null
      setAttStats(found)
      const ov = await loadAttendanceOverrides()
      setAttTotal(ov[courseCode]?.total ?? null)
    })().catch(() => undefined)
  }, [courseCode, attVersion])

  const resolvedSessions = useMemo(() => resolveTermDates(attStats?.sessions ?? [], new Date()), [attStats])
  const weeks = useMemo(() => {
    const tw = termWeeksFromSessions(resolvedSessions)
    return tw.length ? tw : weekList(new Date(), 2, 16)
  }, [resolvedSessions])
  const thisKey = weekMondayKey(new Date())
  const excludeDates = useMemo(() => deriveExcludedDates(pattern, resolvedSessions), [pattern, resolvedSessions])
  const risk: AttendanceRisk | null = useMemo(
    () =>
      attStats
        ? computeAttendanceRisk(attStats, {
            ...(attTotal != null ? { totalOverride: attTotal } : {}),
            ...(excludeDates.length ? { excludeDates } : {}),
          })
        : null,
    [attStats, attTotal, excludeDates],
  )

  const changeTotal = (delta: number) => {
    const base = attTotal ?? risk?.scheduledTotal ?? 0
    const next = Math.max(0, base + delta)
    setAttTotal(next)
    saveAttendanceOverride(courseCode, { total: next }).catch(() => undefined)
  }

  const updatePattern = (next: WeeklyPattern) => {
    setPattern(next)
    saveWeeklyPattern(courseCode, next).catch(() => undefined)
  }

  return (
    <ScreenBg>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, { paddingBottom: clearance }]}
        // 手動スクロールが入ったら以後は自動追従しない（読んでいる位置を奪わない）。
        onScrollBeginDrag={() => {
          focusScroll.current = { ...focusScroll.current, userScrolled: true }
        }}
      >
        <Text style={[styles.courseName, { color: ui.labelColor }]} numberOfLines={1}>
          {name}
        </Text>
        <View
          style={[ui.card, styles.section]}
          onLayout={(e) => {
            attendanceY.current = e.nativeEvent.layout.y
            maybeScrollToFocus()
          }}
        >
          <Text style={[styles.sectionTitle, { color: ui.valueColor }]}>出欠</Text>
          {risk && risk.trackable ? (
            <>
              <Text style={[styles.attSub, { color: ui.labelColor }]}>
                欠席{risk.absent} / 上限{risk.allowedAbsences}（全{risk.scheduledTotal}回）
              </Text>
              <Text style={[styles.attSub, { color: ui.labelColor, marginTop: 6 }]}>
                出席{risk.attended}・欠席{risk.absent}
                {risk.late ? `・遅刻${risk.late}` : ''}
                {risk.earlyLeave ? `・早退${risk.earlyLeave}` : ''}
                {risk.official ? `・公欠${risk.official}` : ''}
                {risk.canceled ? `・休講${risk.canceled}` : ''}
              </Text>
              {attStats && attStats.sessions.some((s) => s.date) ? (
                <View style={[styles.attSessionList, { borderTopColor: ui.dividerColor }]}>
                  {attStats.sessions
                    .filter((s) => s.date)
                    .map((s, i) => {
                      const excluded = excludeDates.includes(s.date as string)
                      const markColor = excluded
                        ? ui.labelColor
                        : s.mark === 'absent'
                          ? ui.colors.danger
                          : s.mark === 'none'
                            ? ui.labelColor
                            : ui.valueColor
                      return (
                        <View
                          key={`${s.date}-${i}`}
                          style={[styles.attSessionRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor }]}
                        >
                          <Text style={[styles.attSessionDate, { color: excluded ? ui.labelColor : ui.valueColor }]}>
                            第{i + 1}回 ・ {s.date}
                          </Text>
                          <Text style={[styles.attSessionMark, { color: markColor }]}>
                            {excluded ? '休み週・除外' : MARK_LABEL[s.mark]}
                          </Text>
                        </View>
                      )
                    })}
                </View>
              ) : null}
              <View style={[styles.attStepper, { borderTopColor: ui.dividerColor }]}>
                <Text style={[styles.attSub, { color: ui.labelColor }]}>総回数（隔週などで手動調整）</Text>
                <View style={styles.attStepBtns}>
                  {/* アイコンだけのボタンは読み上げ名を持たないので明示する（E0 A4・AssignmentsScreen と同じ形）。
                      30x30 は最小タップ領域に足りないため hitSlop で広げる。 */}
                  <Pressable
                    style={[styles.attStepBtn, { backgroundColor: ui.softBoxBg }]}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="総回数を1減らす"
                    onPress={() => changeTotal(-1)}
                  >
                    <Ionicons name="remove" size={16} color={ui.accentSoft} />
                  </Pressable>
                  <Text style={[styles.attTotalNum, { color: ui.valueColor }]}>{attTotal ?? risk.scheduledTotal}</Text>
                  <Pressable
                    style={[styles.attStepBtn, { backgroundColor: ui.softBoxBg }]}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="総回数を1増やす"
                    onPress={() => changeTotal(1)}
                  >
                    <Ionicons name="add" size={16} color={ui.accentSoft} />
                  </Pressable>
                </View>
              </View>
            </>
          ) : !attCollected ? (
            <Text style={[styles.attSub, { color: ui.labelColor }]}>
              出欠データはまだ取得できていません。時間割タブで下に引いて同期すると、CLASSの「学生出欠状況確認」から自動で取得します。
            </Text>
          ) : (
            <Text style={[styles.attSub, { color: ui.labelColor }]}>
              この科目はまだCLASS出欠の記録がありません。担当教員がCLASSで出欠を取らない科目や、学期序盤で記録がない場合は数字が表示されません。
            </Text>
          )}
        </View>

        <View
          style={[ui.card, styles.section]}
          onLayout={(e) => {
            patternY.current = e.nativeEvent.layout.y
            maybeScrollToFocus()
          }}
        >
          <Text style={[styles.sectionTitle, { color: ui.valueColor }]}>実施パターン</Text>
          <Text style={[styles.patHint, { color: ui.labelColor, marginBottom: 8, marginTop: 0 }]}>
            実施する週を選びます。既定は全週実施。隔週は「プリセット」で入れて、ずれた週だけタップで切り替えてください。
          </Text>
          <View style={styles.segRow}>
            <Pressable style={[styles.presetBtn, { backgroundColor: ui.softBoxBg }]} onPress={() => updatePattern(applyBiweeklyPreset(mondayOf(new Date()), weeks))}>
              <Ionicons name="repeat-outline" size={15} color={ui.accentSoft} />
              <Text style={[styles.presetText, { color: ui.accentSoft }]}>隔週プリセット</Text>
            </Pressable>
            <Pressable style={[styles.presetBtn, { backgroundColor: ui.softBoxBg }]} onPress={() => updatePattern(clearPattern())}>
              <Ionicons name="checkmark-done-outline" size={15} color={ui.accentSoft} />
              <Text style={[styles.presetText, { color: ui.accentSoft }]}>全週実施に戻す</Text>
            </Pressable>
          </View>
          <View style={{ marginTop: 8 }}>
            {weeks.map((w) => {
              const off = isWeekOff(pattern, w)
              const isThis = weekMondayKey(w) === thisKey
              return (
                <Pressable
                  key={weekMondayKey(w)}
                  onPress={() => updatePattern(toggleWeek(pattern, w))}
                  style={[styles.weekRow, { borderBottomColor: ui.dividerColor }]}
                >
                  <Text style={[styles.weekLabel, { color: off ? ui.labelColor : ui.valueColor, fontWeight: isThis ? '800' : '500' }]}>
                    {w.getMonth() + 1}/{w.getDate()} の週{isThis ? ' ・ 今週' : ''}
                  </Text>
                  <View style={[styles.weekPill, { backgroundColor: off ? ui.colors.patternOffBg : ui.pillBg }]}>
                    <Text style={{ color: off ? ui.colors.patternOffText : ui.pillText, fontSize: 12, fontWeight: '700' }}>
                      {off ? '休み' : '実施'}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  body: { padding: 14, gap: 12 },
  courseName: { fontSize: 13, marginBottom: -4 },
  section: { gap: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  attSub: { fontSize: 12.5 },
  attSessionList: { marginTop: 10, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  attSessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  attSessionDate: { fontSize: 13 },
  attSessionMark: { fontSize: 13, fontWeight: '600' },
  attStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  attStepBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attStepBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  attTotalNum: { fontSize: 16, fontWeight: '700', minWidth: 28, textAlign: 'center' },
  patHint: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  segRow: { flexDirection: 'row', gap: 8 },
  presetBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 12 },
  presetText: { fontSize: 12.5, fontWeight: '700' },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  weekLabel: { fontSize: 14 },
  weekPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, minWidth: 52, alignItems: 'center' },
})
