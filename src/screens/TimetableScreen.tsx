// app/src/screens/TimetableScreen.tsx
import { useCallback, useState } from 'react'
import { Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadTimetable } from '../storage/timetableStore'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { TimetableStackParamList } from '../navigation/types'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'

const DAY_LABEL: Record<string, string> = {
  mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土',
}

export default function TimetableScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const [collections, setCollections] = useState<TimetableCollection[] | null>(null)
  const [updatedCodes, setUpdatedCodes] = useState<Set<string>>(new Set())

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadTimetable().then((c) => {
        if (active) setCollections(c)
      })
      ;(async () => {
        const map = await loadCourseMap()
        const snaps = await loadCourseSnapshots()
        const set = new Set<string>()
        for (const [code, course] of Object.entries(map)) {
          const snap = snaps[course.url]
          if (snap && snap.added.length + snap.removed.length > 0) set.add(code)
        }
        if (active) setUpdatedCodes(set)
      })()
      return () => {
        active = false
      }
    }, []),
  )

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <Button title="更新" onPress={() => navigation.navigate('Collect')} />
        <Button title="コース収集" onPress={() => navigation.navigate('CollectCourses')} />
        <Button title="更新チェック" onPress={() => navigation.navigate('UpdateCheck')} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!collections || collections.length === 0 ? (
          <Text style={styles.empty}>まだ収集していません。「更新」から収集してください。</Text>
        ) : (
          collections.map((c, i) => (
            <View key={i} style={styles.collection}>
              <Text style={styles.campus}>
                時間割{i + 1}（{c.slots.length}コマ）
                {c.periodTimes ? ` ・ ${c.periodTimes.campus}` : ''}
              </Text>
              {c.slots.map((s) => (
                <View key={`${i}-${s.day}-${s.period}`} style={styles.row}>
                  <Text style={styles.rowLabel}>{DAY_LABEL[s.day]}{s.period}:</Text>
                  {s.classes.map((cl) => (
                    <Pressable
                      key={cl.courseCode || cl.name}
                      onPress={() => navigation.navigate('SubjectDetail', { courseCode: cl.courseCode, name: cl.name })}
                    >
                      <Text style={styles.subject}>
                        {cl.name}（{cl.room}）{updatedCodes.has(cl.courseCode) ? ' ●' : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { padding: 8, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  content: { padding: 12 },
  empty: { color: '#666' },
  collection: { marginBottom: 12 },
  campus: { fontWeight: '600', marginBottom: 6 },
  row: { marginBottom: 6 },
  rowLabel: { fontWeight: '600' },
  subject: { color: '#1a4d8f', paddingVertical: 2 },
})
