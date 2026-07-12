// app/src/screens/SubjectDetailScreen.tsx
import { cloneElement, useEffect, useMemo, useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SectionLabel, useUi, useTabBarClearance } from '../ui/screen'
import { Accordion } from '../ui/Accordion'
import { resolveNextSession, pickAttentionEvent, type NextSession } from '../timetableEvents/nextSession'
import { COLORS, DARK } from '../theme'
import type { TimetableStackParamList } from '../navigation/types'
import { loadCourseMap } from '../storage/courseMapStore'
import { buildSyllabusUrl } from '../links/syllabus'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'
import type { CourseSnapshot } from '../storage/courseSnapshotSerialize'
import { loadClassEvents, upsertClassEvent } from '../storage/classEventsStore'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { cellBadgeText } from '../timetableEvents/eventLabels'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import { useBulletinEventCandidates } from '../timetableEvents/useBulletinEventCandidates'
import { candidateToClassEvent, type CandidateView } from '../timetableEvents/bulletinEvents'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
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
import { loadAttendanceStats } from '../storage/attendanceStatsStore'
import { loadAttendanceOverrides, saveAttendanceOverride } from '../storage/attendanceOverridesStore'
import { computeAttendanceRisk, type AttendanceRisk } from '../attendance/attendanceRisk'
import type { AttendanceCourseStats } from '../parsers/attendanceStats'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import { courseUnreadCounts } from '../timetableEvents/courseUnread'

type IconName = keyof typeof Ionicons.glyphMap

function InfoChip({ icon, label }: { icon: IconName; label: string }) {
  const ui = useUi()
  return (
    <View style={[styles.chip, { backgroundColor: ui.colors.chipBg, borderWidth: 1, borderColor: ui.colors.chipBorder }]}>
      <Ionicons name={icon} size={12} color={ui.pillText} />
      <Text style={[styles.chipText, { color: ui.pillText }]}>{label}</Text>
    </View>
  )
}

function LinkAction({ icon, title, sub, onPress }: { icon: IconName; title: string; sub?: string; onPress?: () => void }) {
  const ui = useUi()
  return (
    <Pressable style={[ui.card, styles.linkRow]} onPress={onPress}>
      <View style={[styles.linkIcon, { backgroundColor: ui.softBoxBg }]}>
        <Ionicons name={icon} size={19} color={ui.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.linkTitle, { color: ui.valueColor }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.linkSub, { color: ui.labelColor }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={ui.chevron} />
    </Pressable>
  )
}

function SubjectSummaryCard({
  rows,
}: {
  rows: { key: string; icon: IconName; text: string; attention?: boolean; onPress?: () => void }[]
}) {
  const ui = useUi()
  if (rows.length === 0) return null
  return (
    <View style={[ui.card, { marginBottom: 10, gap: 8 }]}>
      {rows.map((r) => {
        const color = r.attention ? COLORS.danger : ui.valueColor
        const body = (
          <View style={styles.summaryRow}>
            <Ionicons name={r.icon} size={16} color={color} />
            <Text style={[styles.summaryText, { color }]} numberOfLines={1}>
              {r.text}
            </Text>
            {r.onPress ? <Ionicons name="chevron-forward" size={15} color={ui.chevron} /> : null}
          </View>
        )
        return r.onPress ? (
          <Pressable key={r.key} onPress={r.onPress}>
            {body}
          </Pressable>
        ) : (
          cloneElement(body, { key: r.key })
        )
      })}
    </View>
  )
}

export default function SubjectDetailScreen() {
  const route = useRoute<RouteProp<TimetableStackParamList, 'SubjectDetail'>>()
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const { courseCode, name, day, dayKey, period, room, teachers, isRemote } = route.params
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { version, bump } = useClassEventsVersion()
  const candidates = useBulletinEventCandidates(courseCode, name)
  const [letusUrl, setLetusUrl] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<CourseSnapshot | null>(null)
  const [events, setEvents] = useState<ClassEvent[]>([])
  const [pattern, setPattern] = useState<WeeklyPattern>({})
  const [attStats, setAttStats] = useState<AttendanceCourseStats | null>(null)
  const [attTotal, setAttTotal] = useState<number | null>(null)
  const [unread, setUnread] = useState(0)
  // カレンダー用の週リスト（今週の2週前〜16週後）。画面表示中は固定。
  const weeks = useMemo(() => weekList(new Date(), 2, 16), [])
  const thisKey = weekMondayKey(new Date())

  const syllabusUrl = buildSyllabusUrl(courseCode, new Date())

  useEffect(() => {
    loadWeeklyPatterns()
      .then((m) => setPattern(m[courseCode] ?? {}))
      .catch(() => undefined)
  }, [courseCode])

  const updatePattern = (next: WeeklyPattern) => {
    setPattern(next)
    saveWeeklyPattern(courseCode, next).catch(() => undefined)
  }

  useEffect(() => {
    ;(async () => {
      const data = await loadAttendanceStats()
      const found = data?.courses.find((c) => c.courseCode === courseCode) ?? null
      setAttStats(found)
      const ov = await loadAttendanceOverrides()
      setAttTotal(ov[courseCode]?.total ?? null)
    })().catch(() => undefined)
  }, [courseCode])

  const risk: AttendanceRisk | null = useMemo(
    () => (attStats ? computeAttendanceRisk(attStats, attTotal != null ? { totalOverride: attTotal } : undefined) : null),
    [attStats, attTotal],
  )

  const changeTotal = (delta: number) => {
    const base = attTotal ?? risk?.scheduledTotal ?? 0
    const next = Math.max(0, base + delta)
    setAttTotal(next)
    saveAttendanceOverride(courseCode, { total: next }).catch(() => undefined)
  }

  useEffect(() => {
    ;(async () => {
      const map = await loadCourseMap()
      const course = map[courseCode] ?? null
      setLetusUrl(course?.url ?? null)
      if (course) {
        const snaps = await loadCourseSnapshots()
        setSnapshot(snaps[course.url] ?? null)
      }
    })()
  }, [courseCode])

  useEffect(() => {
    loadClassEvents()
      .then((all) => setEvents(all.filter((e) => e.courseName === name).sort((a, b) => (a.date < b.date ? -1 : 1))))
      .catch(() => undefined)
  }, [name, version])

  useEffect(() => {
    loadBulletinDigest()
      .then((d) => setUnread(courseUnreadCounts(d, new Set([courseCode])).get(courseCode) ?? 0))
      .catch(() => undefined)
  }, [courseCode])

  const hasDiff = !!snapshot && snapshot.added.length + snapshot.removed.length > 0

  const now = new Date()
  const next = useMemo(
    () => resolveNextSession({ day: dayKey, period, baseRoom: room, pattern, events, now }),
    // now は描画毎に新規だが day/period/room/pattern/events の変化で十分。意図的に now を依存から外す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey, period, room, pattern, events],
  )
  const attention = useMemo(() => pickAttentionEvent(events, now), [events]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmtNext = (n: NextSession): string => {
    const [y, mo, d] = n.date.split('-').map(Number)
    const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, mo - 1, d).getDay()]
    const per = n.period != null ? `${n.period}限` : ''
    const rm = n.room ? `・${n.room}` : ''
    const extra = n.note ? `（${n.note}）` : ''
    return `次回 ${mo}/${d}(${wd}) ${per}${rm}${extra}`.trim()
  }

  type SummaryRow = { key: string; icon: IconName; text: string; attention?: boolean; onPress?: () => void }
  const summaryRows: SummaryRow[] = []
  if (next) summaryRows.push({ key: 'next', icon: 'calendar-outline', text: fmtNext(next) })
  if (attention) {
    const [, am, ad] = attention.date.split('-')
    const label = attention.type === 'cancel' ? '休講・補講未入力' : '教室変更'
    summaryRows.push({
      key: 'attn',
      icon: 'alert-circle-outline',
      text: `${Number(am)}/${Number(ad)} ${label}`,
      attention: true,
      onPress: () =>
        navigation.navigate('ClassEventForm', { courseName: name, courseCode, dayKey, editId: attention.id }),
    })
  }
  if (risk && risk.trackable) {
    summaryRows.push({
      key: 'att',
      icon: 'checkmark-circle-outline',
      text: risk.remaining > 0 ? `出欠 あと${risk.remaining}回休める` : '出欠 危険ライン到達',
      attention: risk.level !== 'safe',
    })
  }
  if (unread > 0) {
    summaryRows.push({ key: 'unread', icon: 'mail-unread-outline', text: `未読の掲示 ${unread}件` })
  }

  // 候補[追加]: 候補→ClassEvent を保存し、時間割/通知に反映。掲示idを createdAt に用いて決定論ID。
  const addCandidate = async (v: CandidateView) => {
    await upsertClassEvent(candidateToClassEvent(v.candidate, v.candidate.sourceBulletinId))
    bump()
    refreshAllNotifications().catch(() => undefined)
  }
  // 候補[補講を追記]: 既存の休講イベントに補講日を上書きする。
  const appendMakeup = async (v: CandidateView) => {
    if (!v.matchedEventId || !v.candidate.makeup) return
    const target = (await loadClassEvents()).find((e) => e.id === v.matchedEventId)
    if (!target) return
    await upsertClassEvent({ ...target, makeupStatus: 'has', makeup: v.candidate.makeup })
    bump()
    refreshAllNotifications().catch(() => undefined)
  }

  return (
    <View style={styles.root}>
      {ui.colors.gradient ? <LinearGradient colors={ui.colors.gradient} style={StyleSheet.absoluteFill} /> : null}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: clearance }]}>
        <View style={[ui.card, styles.hero]}>
          <Text style={[styles.name, { color: ui.valueColor }]}>{name}</Text>
          <Text style={[styles.code, { color: ui.labelColor }]}>
            {courseCode}
            {day && period ? ` ・ ${day}曜${period}限` : ''}
          </Text>
          {room || (teachers && teachers[0]) ? (
            <View style={styles.chipRow}>
              {room ? <InfoChip icon="location-outline" label={isRemote ? `${room}・遠隔` : room} /> : null}
              {teachers && teachers[0] ? <InfoChip icon="person-outline" label={teachers[0]} /> : null}
            </View>
          ) : null}
          {unread > 0 ? (
            <View style={styles.chipRow}>
              <InfoChip icon="mail-unread-outline" label={`未読の掲示 ${unread}件`} />
            </View>
          ) : null}
        </View>

        <SubjectSummaryCard rows={summaryRows} />

        <SectionLabel>リンク</SectionLabel>
        {letusUrl ? (
          <LinkAction
            icon="book-outline"
            title="LETUSコースを開く"
            onPress={() => navigation.navigate('Web', { url: letusUrl, title: name })}
          />
        ) : (
          <View style={[ui.card, { marginBottom: 10 }]}>
            <Text style={{ color: ui.labelColor, fontSize: 13 }}>LETUSコース未突合（「コース収集」を実行してください）</Text>
          </View>
        )}
        <LinkAction
          icon="document-text-outline"
          title="シラバスを開く"
          onPress={() => navigation.navigate('Syllabus', { url: syllabusUrl, name })}
        />
        <LinkAction
          icon="create-outline"
          title="この科目の課題を追加"
          onPress={() =>
            // タブ（課題）→ネストのManualAssignmentへ横断遷移。親ナビゲータの型は緩いため最小I/Fにキャスト。
            (navigation.getParent() as unknown as { navigate: (name: string, params: object) => void } | undefined)?.navigate('課題', {
              screen: 'ManualAssignment',
              params: { presetCourseName: name, presetCourseCode: courseCode },
            })
          }
        />

        {risk && risk.trackable ? (
          <Accordion
            title="出欠"
            icon="checkmark-done-outline"
            subtitle={risk.remaining > 0 ? `あと${risk.remaining}回休める（欠席${risk.absent}/上限${risk.allowedAbsences}）` : '危険ライン到達'}
          >
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
            <View style={[styles.attStepper, { borderTopColor: ui.dividerColor }]}>
              <Text style={[styles.attSub, { color: ui.labelColor }]}>総回数（隔週などで手動調整）</Text>
              <View style={styles.attStepBtns}>
                <Pressable style={[styles.attStepBtn, ui.dark && { backgroundColor: DARK.softBox }]} onPress={() => changeTotal(-1)}>
                  <Ionicons name="remove" size={16} color={ui.accentSoft} />
                </Pressable>
                <Text style={[styles.attTotalNum, { color: ui.valueColor }]}>{attTotal ?? risk.scheduledTotal}</Text>
                <Pressable style={[styles.attStepBtn, ui.dark && { backgroundColor: DARK.softBox }]} onPress={() => changeTotal(1)}>
                  <Ionicons name="add" size={16} color={ui.accentSoft} />
                </Pressable>
              </View>
            </View>
          </Accordion>
        ) : null}

        <Accordion
          title="各回の予定"
          icon="list-outline"
          subtitle={attention ? `直近: ${Number(attention.date.split('-')[1])}/${Number(attention.date.split('-')[2])} ${attention.type === 'cancel' ? '休講' : '教室変更'}` : events.length ? `${events.length}件` : undefined}
          right={
            attention && attention.type === 'cancel' && attention.makeupStatus === 'undecided' ? (
              <View style={styles.makeupPill}>
                <Text style={styles.makeupPillText}>要対応</Text>
              </View>
            ) : undefined
          }
        >
          <View style={styles.eventsHead}>
            <Text style={{ color: ui.labelColor, fontSize: 12 }}>休講・補講・教室変更・小テスト等</Text>
            <Pressable
              style={[styles.addBtn, { backgroundColor: ui.softBoxBg }]}
              onPress={() => navigation.navigate('ClassEventForm', { courseName: name, courseCode, dayKey })}
            >
              <Ionicons name="add" size={16} color={ui.accent} />
              <Text style={[styles.addBtnText, { color: ui.accent }]}>予定を追加</Text>
            </Pressable>
          </View>
          {candidates.map((v) => (
            <View key={`cand-${v.candidate.sourceBulletinId}`} style={[ui.card, styles.candRow]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.candHead}>
                  <View style={styles.candTag}>
                    <Text style={styles.candTagText}>掲示より</Text>
                  </View>
                  <Text style={[styles.eventText, { color: ui.valueColor }]} numberOfLines={1}>
                    {cellBadgeText(candidateToClassEvent(v.candidate, v.candidate.sourceBulletinId))}
                  </Text>
                </View>
                <Text style={[styles.eventSub, { color: ui.labelColor }]}>
                  {v.candidate.date} ・ {v.candidate.periods.join('・')}限
                  {v.candidate.makeup ? ` ・ 補講 ${v.candidate.makeup.date}` : ''}
                </Text>
              </View>
              {v.state === 'added' ? (
                <Text style={[styles.candDone, { color: ui.labelColor }]}>追加済み</Text>
              ) : v.state === 'makeupAppend' ? (
                <Pressable style={styles.candBtn} onPress={() => appendMakeup(v)}>
                  <Text style={styles.candBtnText}>補講を追記</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.candBtn} onPress={() => addCandidate(v)}>
                  <Text style={styles.candBtnText}>追加</Text>
                </Pressable>
              )}
            </View>
          ))}
          {events.length === 0 ? (
            <Text style={{ color: ui.labelColor, fontSize: 13, marginTop: 8 }}>
              休講・補講・教室変更・小テスト・中間・期末などを登録できます。
            </Text>
          ) : (
            events.map((e) => (
              <Pressable
                key={e.id}
                style={[ui.card, styles.eventRow]}
                onPress={() => navigation.navigate('ClassEventForm', { courseName: name, courseCode, dayKey, editId: e.id })}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.eventText, { color: ui.valueColor }]}>{cellBadgeText(e)}</Text>
                  <Text style={[styles.eventSub, { color: ui.labelColor }]}>
                    {e.periods.join('・')}限{e.note ? ` ・ ${e.note}` : ''}
                  </Text>
                </View>
                {e.type === 'cancel' && e.makeupStatus === 'undecided' ? (
                  <View style={styles.makeupPill}>
                    <Text style={styles.makeupPillText}>補講を入力</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={ui.chevron} />
                )}
              </Pressable>
            ))
          )}
        </Accordion>

        <Accordion
          title="実施パターン"
          icon="repeat-outline"
          subtitle={pattern.off && Object.keys(pattern.off).length ? '隔週・変則あり' : '全週実施'}
        >
          <Text style={[styles.patHint, { color: ui.labelColor, marginBottom: 8, marginTop: 0 }]}>
            実施する週を選びます。既定は全週実施。隔週は「プリセット」で入れて、ずれた週だけタップで切り替えてください。
          </Text>
          <View style={styles.segRow}>
            <Pressable style={[styles.presetBtn, ui.dark && { backgroundColor: DARK.softBox }]} onPress={() => updatePattern(applyBiweeklyPreset(mondayOf(new Date()), weeks))}>
              <Ionicons name="repeat-outline" size={15} color={ui.accentSoft} />
              <Text style={[styles.presetText, { color: ui.accentSoft }]}>隔週プリセット</Text>
            </Pressable>
            <Pressable style={[styles.presetBtn, ui.dark && { backgroundColor: DARK.softBox }]} onPress={() => updatePattern(clearPattern())}>
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
                  <View style={[styles.weekPill, { backgroundColor: off ? '#f2ddd6' : ui.pillBg }]}>
                    <Text style={{ color: off ? '#a33417' : ui.pillText, fontSize: 12, fontWeight: '700' }}>
                      {off ? '休み' : '実施'}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </Accordion>

        <Accordion
          title="更新状況"
          icon="refresh-outline"
          subtitle={!snapshot ? '未チェック' : !hasDiff ? '更新なし' : `更新あり ${snapshot.added.length + snapshot.removed.length}件`}
        >
          {!snapshot ? (
            <Text style={{ color: ui.labelColor }}>未チェック（「更新チェック」を実行してください）</Text>
          ) : !hasDiff ? (
            <Text style={{ color: ui.labelColor }}>前回チェック以降の更新はありません。</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {snapshot.added.map((a) => (
                <View key={`a-${a.url}`} style={styles.diffRow}>
                  <Text style={styles.diffPlus}>＋</Text>
                  <Text style={[styles.diffText, { color: ui.valueColor }]}>{a.title}</Text>
                </View>
              ))}
              {snapshot.removed.map((r) => (
                <View key={`r-${r.url}`} style={styles.diffRow}>
                  <Text style={styles.diffMinus}>－</Text>
                  <Text style={[styles.diffText, { color: ui.labelColor }]}>{r.title}</Text>
                </View>
              ))}
            </View>
          )}
        </Accordion>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 14, paddingBottom: 28 },
  hero: { marginBottom: 4 },
  name: { fontSize: 21, fontWeight: '700', lineHeight: 27 },
  code: { fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipGlass: { backgroundColor: 'rgba(255,255,255,0.42)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  chipSolid: { backgroundColor: '#d6efe4' },
  chipText: { fontSize: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  linkIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 15, fontWeight: '500' },
  linkSub: { fontSize: 12, marginTop: 2 },
  diffRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  diffPlus: { fontSize: 15, fontWeight: '700', color: COLORS.success, lineHeight: 20 },
  diffMinus: { fontSize: 15, fontWeight: '700', color: COLORS.danger, lineHeight: 20 },
  diffText: { fontSize: 14, flex: 1 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryText: { flex: 1, fontSize: 13, fontWeight: '500' },
  eventsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  addBtnText: { fontSize: 13, fontWeight: '600' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  eventText: { fontSize: 14, fontWeight: '600' },
  eventSub: { fontSize: 12, marginTop: 2 },
  candRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.emerald },
  candHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  candTag: { backgroundColor: '#e8f4ee', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  candTagText: { fontSize: 10, fontWeight: '800', color: COLORS.emeraldDark },
  candDone: { fontSize: 12, fontWeight: '700' },
  candBtn: { backgroundColor: COLORS.emerald, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  candBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  makeupPill: { backgroundColor: COLORS.cta, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  makeupPillText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  segRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  presetText: { fontSize: 12.5, fontWeight: '700' },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekLabel: { fontSize: 14 },
  weekPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, minWidth: 52, alignItems: 'center' },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.05)' },
  segActive: { backgroundColor: COLORS.emerald },
  segText: { fontSize: 14, fontWeight: '700' },
  patRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  reanchor: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  patHint: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  attRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  attRemain: { fontSize: 17, fontWeight: '800' },
  attSub: { fontSize: 12.5 },
  attStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  attStepBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attStepBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)' },
  attTotalNum: { fontSize: 16, fontWeight: '700', minWidth: 28, textAlign: 'center' },
})
