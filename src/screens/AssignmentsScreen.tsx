import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AssignmentCollector from '../collect/AssignmentCollector'
import { loadAssignments, saveAssignments } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AssignmentSubmissionStatus } from '../parsers/letus'
import { bucketAssignments, BUCKET_ORDER, type BucketKey } from '../assignments/buckets'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'
import { isManualUrl } from '../assignments/manualAssignment'
import type { AssignmentsStackParamList } from '../navigation/types'
import { Chip, ScreenBg, ScreenHeader, Segmented, SectionLabel, useUi, useTabBarClearance } from '../ui/screen'
import { useDisplaySettings } from '../displaySettings'
import { byDeadlineAsc, formatDeadline, isSubmitted, relDue, TONE_COLOR, urgencyTone } from '../assignments/deadline'
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

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
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
  const clearance = useTabBarClearance()
  const { assignmentsView } = useDisplaySettings()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [now, setNow] = useState(() => new Date())
  const [filter, setFilter] = useState<Filter>('not_submitted')
  // 期限切れ・非表示はデフォルト折りたたみ（主役はこれから迫る締切）。
  const [showOverdue, setShowOverdue] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  // 課題更新（LETUS再スキャン）を「別画面へ遷移」ではなく、この一覧を保ったまま裏で走らせる。
  // 収集は headless の AssignmentCollector に委譲し、進捗はインジケータで示す。完了時に version が
  // 上がって一覧が差分反映される（既存の scanned 一覧に変更を加えていく形）。
  const [collecting, setCollecting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const startUpdate = useCallback(() => {
    setProgress(null)
    setCollecting(true)
  }, [])

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
    // 手動課題はLETUS詳細を持たないので編集画面へ。LETUS由来は従来どおり詳細へ。
    if (isManualUrl(a.url)) navigation.navigate('ManualAssignment', { url: a.url })
    else navigation.navigate('LetusAssignmentDetail', { url: a.url })
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
          <View style={styles.courseRow}>
            <Text style={[styles.course, { color: ui.labelColor }]} numberOfLines={1}>
              {a.courseName || '科目不明'}
            </Text>
            {isManualUrl(a.url) ? (
              <View style={styles.manualBadge}>
                <Text style={styles.manualBadgeText}>手動</Text>
              </View>
            ) : null}
          </View>
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
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="追加" icon="add" onPress={() => navigation.navigate('ManualAssignment')} />
            <Chip label="更新" icon="refresh" onPress={collecting ? undefined : startUpdate} />
          </View>
        }
      />

      {/* 更新中インジケータ（一覧はそのまま下に表示し続ける）。 */}
      {collecting ? (
        <View style={[ui.card, styles.updatingBar]}>
          <ActivityIndicator size="small" color={COLORS.emerald} />
          <Text style={[styles.updatingText, { color: ui.valueColor }]} numberOfLines={1}>
            課題を更新中…{progress ? ` ${progress.done}/${progress.total} 件` : ''}
          </Text>
        </View>
      ) : null}

      {/* headless 収集本体（画面外1px）。完了で version が上がり一覧が差分反映される。 */}
      {collecting ? (
        <AssignmentCollector
          onProgress={(done, total) => setProgress({ done, total })}
          onFinished={() => {
            setCollecting(false)
            setProgress(null)
          }}
        />
      ) : null}

      {total === 0 && hidden.length === 0 ? (
        <View style={[ui.card, { marginTop: 16 }]}>
          <Text style={{ color: ui.valueColor }}>
            表示できる課題がありません。「更新」でLETUSから取得、「追加」で手動でも登録できます。
          </Text>
        </View>
      ) : assignmentsView === 'flat' ? (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]}>
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
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]}>
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
  updatingBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingVertical: 12 },
  updatingText: { fontSize: 13, fontWeight: '600', flex: 1 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCol: { flex: 1, alignItems: 'flex-start' },
  statNum: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2 },
  flatRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  manualBadge: { backgroundColor: '#e5f3ec', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  manualBadgeText: { fontSize: 10, color: COLORS.emeraldDark, fontWeight: '700' },
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
