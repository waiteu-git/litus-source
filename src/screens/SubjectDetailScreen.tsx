// app/src/screens/SubjectDetailScreen.tsx
import { useEffect, useMemo, useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SectionLabel, useUi } from '../ui/screen'
import { COLORS, useThemeVariant } from '../theme'
import type { TimetableStackParamList } from '../navigation/types'
import { loadCourseMap } from '../storage/courseMapStore'
import { buildSyllabusUrl } from '../links/syllabus'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'
import type { CourseSnapshot } from '../storage/courseSnapshotSerialize'
import { loadClassEvents } from '../storage/classEventsStore'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { cellBadgeText } from '../timetableEvents/eventLabels'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
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

type IconName = keyof typeof Ionicons.glyphMap

function InfoChip({ icon, label }: { icon: IconName; label: string }) {
  const ui = useUi()
  return (
    <View style={[styles.chip, ui.green ? styles.chipGlass : styles.chipSolid]}>
      <Ionicons name={icon} size={12} color={ui.green ? '#04322a' : COLORS.emeraldDark} />
      <Text style={[styles.chipText, { color: ui.green ? '#04322a' : COLORS.emeraldDark }]}>{label}</Text>
    </View>
  )
}

function LinkAction({ icon, title, sub, onPress }: { icon: IconName; title: string; sub?: string; onPress?: () => void }) {
  const ui = useUi()
  return (
    <Pressable style={[ui.card, styles.linkRow]} onPress={onPress}>
      <View style={[styles.linkIcon, { backgroundColor: ui.green ? 'rgba(255,255,255,0.28)' : '#e8f4ee' }]}>
        <Ionicons name={icon} size={19} color={ui.green ? '#ffffff' : COLORS.emerald} />
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
      <Ionicons name="chevron-forward" size={18} color={ui.green ? 'rgba(255,255,255,0.7)' : '#9bb3ab'} />
    </Pressable>
  )
}

export default function SubjectDetailScreen() {
  const route = useRoute<RouteProp<TimetableStackParamList, 'SubjectDetail'>>()
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const { courseCode, name, day, dayKey, period, room, teachers, isRemote } = route.params
  const { variant } = useThemeVariant()
  const ui = useUi()
  const { version } = useClassEventsVersion()
  const [letusUrl, setLetusUrl] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<CourseSnapshot | null>(null)
  const [events, setEvents] = useState<ClassEvent[]>([])
  const [pattern, setPattern] = useState<WeeklyPattern>({})
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

  const hasDiff = !!snapshot && snapshot.added.length + snapshot.removed.length > 0

  return (
    <View style={styles.root}>
      {variant === 'green' ? <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={StyleSheet.absoluteFill} /> : null}
      <ScrollView contentContainerStyle={styles.body}>
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
        </View>

        <SectionLabel>実施パターン</SectionLabel>
        <View style={[ui.card, { marginBottom: 10 }]}>
          <Text style={[styles.patHint, { color: ui.labelColor, marginBottom: 8 }]}>
            実施する週を選びます。既定は全週実施。隔週は「プリセット」で入れて、ずれた週だけタップで切り替えてください。
          </Text>
          <View style={styles.segRow}>
            <Pressable
              style={styles.presetBtn}
              onPress={() => updatePattern(applyBiweeklyPreset(mondayOf(new Date()), weeks))}
            >
              <Ionicons name="repeat-outline" size={15} color={ui.green ? '#eafff7' : COLORS.emerald} />
              <Text style={[styles.presetText, { color: ui.green ? '#eafff7' : COLORS.emerald }]}>隔週プリセット</Text>
            </Pressable>
            <Pressable style={styles.presetBtn} onPress={() => updatePattern(clearPattern())}>
              <Ionicons name="checkmark-done-outline" size={15} color={ui.green ? '#eafff7' : COLORS.emerald} />
              <Text style={[styles.presetText, { color: ui.green ? '#eafff7' : COLORS.emerald }]}>全週実施に戻す</Text>
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
                  <View
                    style={[
                      styles.weekPill,
                      { backgroundColor: off ? '#f2ddd6' : ui.green ? 'rgba(255,255,255,0.32)' : '#d6efe4' },
                    ]}
                  >
                    <Text style={{ color: off ? '#a33417' : ui.green ? '#04322a' : COLORS.emeraldDark, fontSize: 12, fontWeight: '700' }}>
                      {off ? '休み' : '実施'}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={styles.eventsHead}>
          <SectionLabel>各回の予定</SectionLabel>
          <Pressable
            style={[styles.addBtn, { backgroundColor: ui.green ? 'rgba(255,255,255,0.28)' : '#e8f4ee' }]}
            onPress={() => navigation.navigate('ClassEventForm', { courseName: name, courseCode, dayKey })}
          >
            <Ionicons name="add" size={16} color={ui.green ? '#ffffff' : COLORS.emerald} />
            <Text style={[styles.addBtnText, { color: ui.green ? '#ffffff' : COLORS.emerald }]}>予定を追加</Text>
          </Pressable>
        </View>
        {events.length === 0 ? (
          <View style={[ui.card, { marginBottom: 10 }]}>
            <Text style={{ color: ui.labelColor, fontSize: 13 }}>
              休講・補講・教室変更・小テスト・中間・期末などを登録できます。
            </Text>
          </View>
        ) : (
          events.map((e) => (
            <Pressable
              key={e.id}
              style={[ui.card, styles.eventRow]}
              onPress={() => navigation.navigate('ClassEventForm', { courseName: name, courseCode, dayKey, editId: e.id })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.eventText, { color: ui.valueColor }]}>{cellBadgeText(e)}</Text>
                <Text style={[styles.eventSub, { color: ui.labelColor }]}>{e.periods.join('・')}限{e.note ? ` ・ ${e.note}` : ''}</Text>
              </View>
              {e.type === 'cancel' && e.makeupStatus === 'undecided' ? (
                <View style={styles.makeupPill}>
                  <Text style={styles.makeupPillText}>補講を入力</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={ui.green ? 'rgba(255,255,255,0.7)' : '#9bb3ab'} />
              )}
            </Pressable>
          ))
        )}

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

        <SectionLabel>更新状況</SectionLabel>
        <View style={ui.card}>
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
        </View>
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
  eventsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  addBtnText: { fontSize: 13, fontWeight: '600' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  eventText: { fontSize: 14, fontWeight: '600' },
  eventSub: { fontSize: 12, marginTop: 2 },
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
})
