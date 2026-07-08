// app/src/screens/SubjectDetailScreen.tsx
import { useEffect, useState } from 'react'
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
  const { courseCode, name, day, period, room, teachers, isRemote } = route.params
  const { variant } = useThemeVariant()
  const ui = useUi()
  const [letusUrl, setLetusUrl] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<CourseSnapshot | null>(null)

  const syllabusUrl = buildSyllabusUrl(courseCode, new Date())

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
})
