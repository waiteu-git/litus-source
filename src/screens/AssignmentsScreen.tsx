import { useCallback, useState } from 'react'
import { Button, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadAssignments, saveAssignments } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AssignmentSubmissionStatus } from '../parsers/letus'
import { bucketAssignments, BUCKET_ORDER, type BucketKey } from '../assignments/buckets'
import type { AssignmentsStackParamList } from '../navigation/types'

const SECTION_LABEL: Record<BucketKey, string> = {
  within24h: '24時間以内',
  tomorrow: '明日',
  thisWeek: '今週',
  later: 'それ以降',
  beforeStart: '開始前',
  overdue: '期限切れ',
  submitted: '提出済み',
}

const STATUS_LABEL: Record<AssignmentSubmissionStatus, string> = {
  not_submitted: '未提出',
  submitted: '提出済み',
  completed: '受験済み',
  unknown: '状態不明',
}

function formatDeadline(iso: string | null): string {
  if (!iso) return '締切未設定'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '締切未設定'
  const mm = d.getMonth() + 1
  const dd = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

export default function AssignmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const [assignments, setAssignments] = useState<Assignment[]>([])

  const reload = useCallback(async () => {
    const map = await loadAssignments()
    setAssignments(Object.values(map))
  }, [])

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadAssignments().then((map) => {
        if (active) setAssignments(Object.values(map))
      })
      return () => {
        active = false
      }
    }, []),
  )

  async function hide(a: Assignment) {
    const map = await loadAssignments()
    if (map[a.url]) {
      map[a.url] = { ...map[a.url], ignored: true }
      await saveAssignments(map)
      await reload()
    }
  }

  const buckets = bucketAssignments(assignments, new Date())
  const total = BUCKET_ORDER.reduce((n, k) => n + buckets[k].length, 0)

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <Button title="課題を収集" onPress={() => navigation.navigate('CollectAssignments')} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {total === 0 ? (
          <Text style={styles.empty}>
            表示できる課題がありません。「課題を収集」から取得してください。
          </Text>
        ) : (
          BUCKET_ORDER.filter((k) => buckets[k].length > 0).map((k) => (
            <View key={k} style={styles.section}>
              <Text style={styles.sectionTitle}>{SECTION_LABEL[k]}</Text>
              {buckets[k].map((a) => (
                <Pressable
                  key={a.url}
                  onPress={() => Linking.openURL(a.url)}
                  onLongPress={() => hide(a)}
                  style={styles.card}
                >
                  <Text style={styles.cardTitle}>{a.title}</Text>
                  <Text style={styles.cardMeta}>
                    {a.courseName || '科目不明'} ・ {formatDeadline(a.deadline)} ・ {STATUS_LABEL[a.submissionStatus]}
                  </Text>
                </Pressable>
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
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6, color: '#1a4d8f' },
  card: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  cardTitle: { fontSize: 15 },
  cardMeta: { color: '#666', marginTop: 2, fontSize: 13 },
})
