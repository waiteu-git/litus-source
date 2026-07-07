import { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadAssignments, saveAssignments } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AssignmentSubmissionStatus } from '../parsers/letus'
import { bucketAssignments, BUCKET_ORDER, type BucketKey } from '../assignments/buckets'
import type { AssignmentsStackParamList } from '../navigation/types'
import { Chip, ScreenBg, ScreenHeader, SectionLabel, useUi } from '../ui/screen'

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

const URGENT: Set<BucketKey> = new Set(['within24h', 'overdue'])

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

function relDue(iso: string | null, now: Date): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sec = Math.floor((d.getTime() - now.getTime()) / 1000)
  if (sec <= 0) return '締切超過'
  const day = Math.floor(sec / 86400)
  if (day >= 1) return `あと${day}日`
  const h = Math.floor(sec / 3600)
  if (h >= 1) return `あと${h}時間`
  return `あと${Math.max(1, Math.floor(sec / 60))}分`
}

function StatusChip({ status }: { status: AssignmentSubmissionStatus }) {
  const submitted = status === 'submitted' || status === 'completed'
  return (
    <View style={[styles.chip, submitted ? styles.chipOk : styles.chipNg]}>
      <Text style={[styles.chipText, submitted ? styles.chipTextOk : styles.chipTextNg]}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  )
}

export default function AssignmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const ui = useUi()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [now, setNow] = useState(() => new Date())

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

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  async function hide(a: Assignment) {
    const map = await loadAssignments()
    if (map[a.url]) {
      map[a.url] = { ...map[a.url], ignored: true }
      await saveAssignments(map)
      await reload()
    }
  }

  const buckets = bucketAssignments(assignments, now)
  const total = BUCKET_ORDER.reduce((n, k) => n + buckets[k].length, 0)

  return (
    <ScreenBg>
      <ScreenHeader
        title="課題"
        right={<Chip label="更新" onPress={() => navigation.navigate('CollectAssignments')} />}
      />
      {total === 0 ? (
        <View style={[ui.card, { marginTop: 16 }]}>
          <Text style={{ color: ui.valueColor }}>
            表示できる課題がありません。「更新」から取得してください。
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {BUCKET_ORDER.filter((k) => buckets[k].length > 0).map((k) => (
            <View key={k}>
              <SectionLabel>{SECTION_LABEL[k]}</SectionLabel>
              {buckets[k].map((a) => {
                const rel = relDue(a.deadline, now)
                const done = k === 'submitted'
                return (
                  <Pressable
                    key={a.url}
                    onPress={() => Linking.openURL(a.url)}
                    onLongPress={() => hide(a)}
                    style={[ui.card, URGENT.has(k) && styles.urgent, styles.card, done && { opacity: 0.72 }]}
                  >
                    <Text style={[styles.course, { color: ui.labelColor }]} numberOfLines={1}>
                      {a.courseName || '科目不明'}
                    </Text>
                    <Text style={[styles.title, { color: ui.valueColor }]} numberOfLines={2}>
                      {a.title}
                    </Text>
                    <View style={styles.meta}>
                      <Text style={[styles.due, { color: ui.labelColor }]} numberOfLines={1}>
                        {formatDeadline(a.deadline)}
                        {rel ? ` ・ ${rel}` : ''}
                      </Text>
                      <StatusChip status={a.submissionStatus} />
                    </View>
                  </Pressable>
                )
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: 4, paddingBottom: 12 },
  card: { marginBottom: 9 },
  urgent: { borderLeftWidth: 4, borderLeftColor: '#ff7a5c' },
  course: { fontSize: 11 },
  title: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  due: { fontSize: 12, flex: 1, paddingRight: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  chipNg: { backgroundColor: '#ffdcd4' },
  chipOk: { backgroundColor: 'rgba(255,255,255,0.6)' },
  chipText: { fontSize: 11 },
  chipTextNg: { color: '#a33417' },
  chipTextOk: { color: '#0a5c48' },
})
