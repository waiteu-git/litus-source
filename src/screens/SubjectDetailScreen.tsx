// app/src/screens/SubjectDetailScreen.tsx
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ActionButton } from '../ui/screen'
import type { TimetableStackParamList } from '../navigation/types'
import { loadCourseMap } from '../storage/courseMapStore'
import { buildSyllabusUrl } from '../links/syllabus'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'
import type { CourseSnapshot } from '../storage/courseSnapshotSerialize'

export default function SubjectDetailScreen() {
  const route = useRoute<RouteProp<TimetableStackParamList, 'SubjectDetail'>>()
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const { courseCode, name } = route.params
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

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.code}>{courseCode}</Text>

      <View style={styles.section}>
        {letusUrl ? (
          <ActionButton
            label="LETUSコースを開く"
            onPress={() => navigation.navigate('Web', { url: letusUrl, title: name })}
          />
        ) : (
          <Text style={styles.muted}>LETUSコース未突合（「コース収集」を実行してください）</Text>
        )}
      </View>
      <View style={styles.section}>
        <ActionButton
          label="シラバスを開く"
          onPress={() => navigation.navigate('Syllabus', { url: syllabusUrl, name })}
        />
      </View>

      <Text style={styles.heading}>更新状況</Text>
      {!snapshot ? (
        <Text style={styles.muted}>未チェック（「更新チェック」を実行してください）</Text>
      ) : snapshot.added.length + snapshot.removed.length === 0 ? (
        <Text style={styles.muted}>前回チェック以降の更新はありません。</Text>
      ) : (
        <View>
          {snapshot.added.map((a) => (
            <Text key={`a-${a.url}`} style={styles.added}>{`＋ ${a.title}`}</Text>
          ))}
          {snapshot.removed.map((r) => (
            <Text key={`r-${r.url}`} style={styles.removed}>{`－ ${r.title}`}</Text>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { padding: 16 },
  name: { fontSize: 18, fontWeight: '700' },
  code: { color: '#666', marginBottom: 12 },
  section: { marginVertical: 6 },
  heading: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  muted: { color: '#888' },
  added: { color: '#0b6b2f', paddingVertical: 2 },
  removed: { color: '#b00020', paddingVertical: 2 },
})
