import { useCallback, useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { PressableRow } from '../ui/Pressable'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { ScreenBg, SectionLabel, useUi, useTabBarClearance } from '../ui/screen'
import { loadAllCourses } from '../storage/allCoursesStore'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadTrackedCourses, saveTrackedCourses } from '../storage/trackedCoursesStore'
import { selectableCourses, toggleTracked, trackedCourseInfos, type TrackedCourseInfo } from '../updates/courseTracking'

/**
 * 追跡コース（LETUS専用コースの課題追跡）。時間割に無く連携もされないコース（コース名に
 * 科目コードが無い特別コース等）は自動収集の対象外——ここで追跡ONにすると次回同期から
 * 時間割科目と同じ仕組みで課題を自動収集する（読み取り専用・締切/提出状態は自動更新）。
 * 設計: docs/superpowers/specs/2026-07-15-letus-only-course-tracking-design.md
 */
export default function TrackedCoursesScreen() {
  const ui = useUi()
  const clearance = useTabBarClearance()
  const [tracked, setTracked] = useState<string[]>([])
  const [trackedRows, setTrackedRows] = useState<TrackedCourseInfo[]>([])
  const [candidates, setCandidates] = useState<TrackedCourseInfo[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const [all, map, cur] = await Promise.all([loadAllCourses(), loadCourseMap(), loadTrackedCourses()])
    const courseMapUrls = new Set(Object.values(map).map((c) => c.url))
    setTracked(cur)
    setTrackedRows(trackedCourseInfos(all, cur))
    setCandidates(selectableCourses(all, courseMapUrls, cur))
    setLoaded(true)
  }, [])

  useFocusEffect(
    useCallback(() => {
      let active = true
      reload().catch(() => active && setLoaded(true))
      return () => {
        active = false
      }
    }, [reload]),
  )

  const apply = useCallback(
    (next: string[]) => {
      setTracked(next)
      saveTrackedCourses(next)
        .then(() => reload())
        .catch(() => undefined)
    },
    [reload],
  )

  function onAdd(c: TrackedCourseInfo) {
    apply(toggleTracked(tracked, c.url))
  }

  function onRemove(c: TrackedCourseInfo) {
    Alert.alert('追跡を解除しますか？', `「${c.name || c.url}」の課題の自動収集を止めます。収集済みの課題は一覧に残ります。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '解除', style: 'destructive', onPress: () => apply(toggleTracked(tracked, c.url)) },
    ])
  }

  return (
    <ScreenBg>
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]}>
        <Text style={[styles.lead, { color: ui.labelColor }]}>
          時間割と連携されないLETUSコース（集中講義・ゼミ・特別コース等）を追跡すると、課題と締切を自動で取り込みます。
        </Text>

        <SectionLabel>追跡中</SectionLabel>
        {trackedRows.length === 0 ? (
          <View style={[ui.card, styles.emptyCard]}>
            <Text style={{ color: ui.labelColor }}>追跡中のコースはありません</Text>
          </View>
        ) : (
          <View style={ui.card}>
            {trackedRows.map((r, i) => (
              <PressableRow
                key={r.url}
                onPress={() => onRemove(r)}
                style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: ui.dividerColor }]}
              >
                <Ionicons name="bookmark" size={18} color={ui.accent} />
                <Text style={[styles.name, { color: ui.valueColor }]} numberOfLines={1}>
                  {r.name || r.url}
                </Text>
                <Text style={[styles.action, { color: ui.labelColor }]}>解除</Text>
              </PressableRow>
            ))}
          </View>
        )}

        <SectionLabel>追加できるコース</SectionLabel>
        {candidates.length === 0 ? (
          <View style={[ui.card, styles.emptyCard]}>
            <Text style={{ color: ui.labelColor }}>
              {loaded
                ? '追加できるコースはありません。LETUSと同期すると、時間割に無いコースがここに表示されます。'
                : '読み込み中…'}
            </Text>
          </View>
        ) : (
          <View style={ui.card}>
            {candidates.map((c, i) => (
              <PressableRow
                key={c.url}
                onPress={() => onAdd(c)}
                style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: ui.dividerColor }]}
              >
                <Ionicons name="add-circle-outline" size={18} color={ui.accent} />
                <Text style={[styles.name, { color: ui.valueColor }]} numberOfLines={1}>
                  {c.name || c.url}
                </Text>
                <Text style={[styles.action, { color: ui.accentSoft }]}>追跡</Text>
              </PressableRow>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: 4, paddingBottom: 24 },
  lead: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  emptyCard: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  name: { flex: 1, fontSize: 14, fontWeight: '500' },
  action: { fontSize: 12, fontWeight: '600' },
})
