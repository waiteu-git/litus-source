import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadAssignments, saveAssignments } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AssignmentSubmissionStatus } from '../parsers/letus'
import { bucketAssignments, BUCKET_ORDER, type BucketKey } from '../assignments/buckets'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'
import type { AssignmentsStackParamList } from '../navigation/types'
import { Chip, ScreenBg, ScreenHeader, Segmented, SectionLabel, useUi } from '../ui/screen'
import { useDisplaySettings } from '../displaySettings'

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
  // 解析できなかった場合も、締切のある課題としては未提出扱いで表示（ユーザー要望）。
  unknown: '未提出',
}

const URGENT: Set<BucketKey> = new Set(['within24h', 'overdue'])

function isSubmitted(a: Assignment): boolean {
  return a.submissionStatus === 'submitted' || a.submissionStatus === 'completed'
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
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

/** 締切順表示（案2b）の緊急度トーン。提出済みはグレー、以降は締切までの時間で判定。 */
function urgencyTone(a: Assignment, now: Date): 'red' | 'amber' | 'green' | 'gray' {
  if (isSubmitted(a)) return 'gray'
  if (!a.deadline) return 'green'
  const ms = new Date(a.deadline).getTime() - now.getTime()
  if (ms <= 24 * 3600 * 1000) return 'red'
  if (ms <= 7 * 24 * 3600 * 1000) return 'amber'
  return 'green'
}

const TONE_COLOR: Record<'red' | 'amber' | 'green' | 'gray', string> = {
  red: '#e0533a',
  amber: '#e8a400',
  green: '#0f9e75',
  gray: '#b8ccc3',
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

type Filter = 'not_submitted' | 'submitted' | 'all'

export default function AssignmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const ui = useUi()
  const { assignmentsView } = useDisplaySettings()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [now, setNow] = useState(() => new Date())
  const [filter, setFilter] = useState<Filter>('not_submitted')

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

  // バックグラウンド収集などの保存完了シグナルで、開きっぱなしでも一覧を自動更新。
  const { version } = useAssignmentsVersion()
  useEffect(() => {
    reload()
  }, [version, reload])

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

  function openDetail(a: Assignment) {
    navigation.navigate('LetusAssignmentDetail', { url: a.url })
  }

  const buckets = bucketAssignments(assignments, now)
  const total = BUCKET_ORDER.reduce((n, k) => n + buckets[k].length, 0)

  const live = assignments.filter((a) => !a.ignored)
  const stats = useMemo(() => {
    const dueToday = live.filter((a) => !isSubmitted(a) && a.deadline && isSameLocalDate(new Date(a.deadline), now)).length
    const notSubmitted = live.filter((a) => !isSubmitted(a)).length
    const submitted = live.filter(isSubmitted).length
    return { dueToday, notSubmitted, submitted }
  }, [live, now])

  const flatList = useMemo(() => {
    const filtered = live.filter((a) => {
      if (filter === 'not_submitted') return !isSubmitted(a)
      if (filter === 'submitted') return isSubmitted(a)
      return true
    })
    return [...filtered].sort((a, b) => {
      if (a.deadline === null && b.deadline === null) return a.title.localeCompare(b.title, 'ja')
      if (a.deadline === null) return 1
      if (b.deadline === null) return -1
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    })
  }, [live, filter])

  return (
    <ScreenBg>
      <ScreenHeader
        title="課題"
        icon="checkbox-outline"
        right={<Chip label="更新" icon="refresh" onPress={() => navigation.navigate('CollectAssignments')} />}
      />
      {total === 0 ? (
        <View style={[ui.card, { marginTop: 16 }]}>
          <Text style={{ color: ui.valueColor }}>
            表示できる課題がありません。「更新」から取得してください。
          </Text>
        </View>
      ) : assignmentsView === 'flat' ? (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={[ui.card, styles.statsRow]}>
            <View style={styles.statCol}>
              <Text style={[styles.statNum, { color: '#e0533a' }]}>{stats.dueToday}</Text>
              <Text style={[styles.statLabel, { color: ui.labelColor }]}>今日締切</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={[styles.statNum, { color: ui.valueColor }]}>{stats.notSubmitted}</Text>
              <Text style={[styles.statLabel, { color: ui.labelColor }]}>未提出</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={[styles.statNum, { color: ui.valueColor }]}>{stats.submitted}</Text>
              <Text style={[styles.statLabel, { color: ui.labelColor }]}>提出済み</Text>
            </View>
          </View>
          <Segmented
            options={[
              { key: 'not_submitted', label: '未提出' },
              { key: 'submitted', label: '提出済み' },
              { key: 'all', label: 'すべて' },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <View style={{ marginTop: 12, gap: 8 }}>
            {flatList.length === 0 ? (
              <Text style={{ color: ui.labelColor, marginLeft: 2 }}>該当する課題はありません</Text>
            ) : (
              flatList.map((a) => {
                const tone = urgencyTone(a, now)
                const rel = relDue(a.deadline, now)
                return (
                  <Pressable
                    key={a.url}
                    onPress={() => openDetail(a)}
                    onLongPress={() => hide(a)}
                    style={[ui.card, styles.flatRow]}
                  >
                    <View style={[styles.dot, { backgroundColor: TONE_COLOR[tone] }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.course, { color: ui.labelColor }]} numberOfLines={1}>
                        {a.courseName || '科目不明'}
                      </Text>
                      <Text style={[styles.title, { color: ui.valueColor }]} numberOfLines={1}>
                        {a.title}
                      </Text>
                    </View>
                    <View style={styles.flatRight}>
                      <Text style={[styles.flatRel, { color: TONE_COLOR[tone] }]}>{rel || (isSubmitted(a) ? '提出済み' : '')}</Text>
                      <Text style={[styles.flatDue, { color: ui.labelColor }]}>{formatDeadline(a.deadline)}</Text>
                    </View>
                  </Pressable>
                )
              })
            )}
          </View>
        </ScrollView>
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
                    onPress={() => openDetail(a)}
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
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCol: { flex: 1, alignItems: 'flex-start' },
  statNum: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2 },
  flatRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  flatRight: { alignItems: 'flex-end' },
  flatRel: { fontSize: 13, fontWeight: '700' },
  flatDue: { fontSize: 11, marginTop: 2 },
})
