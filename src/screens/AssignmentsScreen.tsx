import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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
import { COLORS } from '../theme'

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

/** null(締切未設定)は末尾、以外は締切の早い順（＝これから迫っている順）。 */
function byDeadlineAsc(a: Assignment, b: Assignment): number {
  if (a.deadline === null && b.deadline === null) return a.title.localeCompare(b.title, 'ja')
  if (a.deadline === null) return 1
  if (b.deadline === null) return -1
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
}

export default function AssignmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const ui = useUi()
  const { assignmentsView } = useDisplaySettings()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [now, setNow] = useState(() => new Date())
  const [filter, setFilter] = useState<Filter>('not_submitted')
  // 期限切れ・非表示はデフォルト折りたたみ（主役はこれから迫る締切）。
  const [showOverdue, setShowOverdue] = useState(false)
  const [showHidden, setShowHidden] = useState(false)

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

  async function setIgnored(a: Assignment, ignored: boolean) {
    const map = await loadAssignments()
    if (map[a.url]) {
      map[a.url] = { ...map[a.url], ignored }
      await saveAssignments(map)
      await reload()
    }
  }
  const hide = (a: Assignment) => setIgnored(a, true)
  const unhide = (a: Assignment) => setIgnored(a, false)

  function openDetail(a: Assignment) {
    navigation.navigate('LetusAssignmentDetail', { url: a.url })
  }

  const live = assignments.filter((a) => !a.ignored)
  const hidden = useMemo(() => assignments.filter((a) => a.ignored), [assignments])
  const buckets = bucketAssignments(live, now)
  const total = BUCKET_ORDER.reduce((n, k) => n + buckets[k].length, 0)

  const stats = useMemo(() => {
    const dueToday = live.filter((a) => !isSubmitted(a) && a.deadline && isSameLocalDate(new Date(a.deadline), now)).length
    const notSubmitted = live.filter((a) => !isSubmitted(a)).length
    const submitted = live.filter(isSubmitted).length
    return { dueToday, notSubmitted, submitted }
  }, [live, now])

  // 締切順表示: 未提出を「これから迫る(upcoming)」と「期限切れ(overdue)」に分け、overdueは別枠へ格納。
  const { flatMain, flatOverdue } = useMemo(() => {
    const notSub = live.filter((a) => !isSubmitted(a))
    const submitted = [...live.filter(isSubmitted)].sort(byDeadlineAsc)
    const isOverdue = (a: Assignment) => a.deadline !== null && new Date(a.deadline).getTime() < now.getTime()
    const upcoming = [...notSub.filter((a) => !isOverdue(a))].sort(byDeadlineAsc)
    const overdue = [...notSub.filter(isOverdue)].sort(
      (a, b) => new Date(b.deadline as string).getTime() - new Date(a.deadline as string).getTime(),
    )
    if (filter === 'submitted') return { flatMain: submitted, flatOverdue: [] as Assignment[] }
    if (filter === 'all') return { flatMain: [...upcoming, ...submitted], flatOverdue: overdue }
    return { flatMain: upcoming, flatOverdue: overdue } // not_submitted（既定）
  }, [live, filter, now])

  const HideBtn = ({ a }: { a: Assignment }) => (
    <Pressable onPress={() => hide(a)} hitSlop={8} style={styles.hideBtn}>
      <Ionicons name="eye-off-outline" size={18} color={ui.labelColor} />
    </Pressable>
  )

  const FlatRow = ({ a }: { a: Assignment }) => {
    const tone = urgencyTone(a, now)
    const rel = relDue(a.deadline, now)
    return (
      <Pressable onPress={() => openDetail(a)} onLongPress={() => hide(a)} style={[ui.card, styles.flatRow]}>
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
        <HideBtn a={a} />
      </Pressable>
    )
  }

  const HiddenSection = () =>
    hidden.length === 0 ? null : (
      <View style={{ marginTop: 14 }}>
        <Pressable onPress={() => setShowHidden((v) => !v)} style={styles.collapseHead}>
          <Ionicons name={showHidden ? 'chevron-down' : 'chevron-forward'} size={16} color={ui.labelColor} />
          <Text style={[styles.collapseText, { color: ui.labelColor }]}>非表示 {hidden.length}件</Text>
        </Pressable>
        {showHidden
          ? hidden.map((a) => (
              <View key={a.url} style={[ui.card, styles.flatRow]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.course, { color: ui.labelColor }]} numberOfLines={1}>
                    {a.courseName || '科目不明'}
                  </Text>
                  <Text style={[styles.title, { color: ui.valueColor }]} numberOfLines={1}>
                    {a.title}
                  </Text>
                </View>
                <Pressable onPress={() => unhide(a)} style={styles.restoreBtn}>
                  <Text style={styles.restoreText}>戻す</Text>
                </Pressable>
              </View>
            ))
          : null}
      </View>
    )

  return (
    <ScreenBg>
      <ScreenHeader
        title="課題"
        icon="checkbox-outline"
        right={<Chip label="更新" icon="refresh" onPress={() => navigation.navigate('CollectAssignments')} />}
      />
      {total === 0 && hidden.length === 0 ? (
        <View style={[ui.card, { marginTop: 16 }]}>
          <Text style={{ color: ui.valueColor }}>表示できる課題がありません。「更新」から取得してください。</Text>
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
            {flatMain.length === 0 ? (
              <Text style={{ color: ui.labelColor, marginLeft: 2 }}>該当する課題はありません</Text>
            ) : (
              flatMain.map((a) => <FlatRow key={a.url} a={a} />)
            )}
          </View>

          {flatOverdue.length > 0 ? (
            <View style={{ marginTop: 14 }}>
              <Pressable onPress={() => setShowOverdue((v) => !v)} style={styles.collapseHead}>
                <Ionicons name={showOverdue ? 'chevron-down' : 'chevron-forward'} size={16} color="#e0533a" />
                <Text style={[styles.collapseText, { color: '#e0533a' }]}>期限切れ {flatOverdue.length}件</Text>
              </Pressable>
              {showOverdue ? <View style={{ gap: 8 }}>{flatOverdue.map((a) => <FlatRow key={a.url} a={a} />)}</View> : null}
            </View>
          ) : null}

          <HiddenSection />
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
                    <View style={styles.rowTop}>
                      <Text style={[styles.course, { color: ui.labelColor }]} numberOfLines={1}>
                        {a.courseName || '科目不明'}
                      </Text>
                      <HideBtn a={a} />
                    </View>
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
          <HiddenSection />
        </ScrollView>
      )}
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: 4, paddingBottom: 24 },
  card: { marginBottom: 9 },
  urgent: { borderLeftWidth: 4, borderLeftColor: '#ff7a5c' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  hideBtn: { padding: 4, marginLeft: 2 },
  collapseHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginLeft: 2 },
  collapseText: { fontSize: 13, fontWeight: '600' },
  restoreBtn: { backgroundColor: '#eef5f2', borderWidth: 1, borderColor: '#b9ddcd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  restoreText: { color: COLORS.emeraldDark, fontSize: 13, fontWeight: '600' },
})
