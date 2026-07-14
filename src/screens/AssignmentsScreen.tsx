import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from '../ui/Text'
import { PressableRow } from '../ui/Pressable'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AssignmentCollector from '../collect/AssignmentCollector'
import { loadAssignments, mutateAssignments } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AssignmentSubmissionStatus } from '../parsers/letus'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'
import { isManualUrl } from '../assignments/manualAssignment'
import {
  buildAssignmentListItems,
  type AssignmentFilter,
  type ListItem,
} from '../assignments/assignmentListItems'
import type { AssignmentsStackParamList } from '../navigation/types'
import { Chip, ScreenBg, ScreenHeader, Segmented, SectionLabel, useUi, useTabBarClearance } from '../ui/screen'
import { useDisplaySettings } from '../displaySettings'
import { formatDeadline, isSubmitted, relDue, TONE_COLOR, urgencyTone } from '../assignments/deadline'
import { loadCollectionHealth } from '../storage/collectionHealthStore'
import type { StoredHealth } from '../storage/collectionHealthSerialize'
import HealthBanner from '../ui/HealthBanner'
import KillSwitchBanner from '../ui/KillSwitchBanner'
import { evaluateAccess } from '../health/accessGate'
import { isOnlineNow } from '../health/connectivity'
import { syncSkipMessage, syncSkipReason } from '../health/syncSkipNotice'
import { useSyncSkipNotice } from '../ui/useSyncSkipNotice'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { notifyWidgetDataChanged } from '../widget/updateWidget'
import { loadAssignmentsRefreshedAt } from '../storage/refreshMetaStore'
import FreshnessLabel from '../ui/FreshnessLabel'
import { COLORS } from '../theme'

const STATUS_LABEL: Record<AssignmentSubmissionStatus, string> = {
  not_submitted: '未提出',
  submitted: '提出済み',
  completed: '受験済み',
  // 解析できなかった場合も、締切のある課題としては未提出扱いで表示（ユーザー要望）。
  unknown: '未提出',
}

const OVERDUE_COLOR = '#e0533a'

type RowUi = { card: ViewStyle; labelColor: string; valueColor: string }

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

const FlatRow = memo(function FlatRow({
  a,
  now,
  rowUi,
  onOpen,
  onHide,
}: {
  a: Assignment
  now: Date
  rowUi: RowUi
  onOpen: (a: Assignment) => void
  onHide: (a: Assignment) => void
}) {
  const tone = urgencyTone(a, now)
  const rel = relDue(a.deadline, now)
  return (
    <PressableRow onPress={() => onOpen(a)} onLongPress={() => onHide(a)} style={[rowUi.card, styles.flatRow]}>
      <View style={[styles.dot, { backgroundColor: TONE_COLOR[tone] }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.courseRow}>
          <Text style={[styles.course, { color: rowUi.labelColor }]} numberOfLines={1}>
            {a.courseName || '科目不明'}
          </Text>
          {isManualUrl(a.url) ? (
            <View style={styles.manualBadge}>
              <Text style={styles.manualBadgeText}>手動</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.title, { color: rowUi.valueColor }]} numberOfLines={1}>
          {a.title}
        </Text>
      </View>
      <View style={styles.flatRight}>
        <Text style={[styles.flatRel, { color: TONE_COLOR[tone] }]}>{rel || (isSubmitted(a) ? '提出済み' : '')}</Text>
        <Text style={[styles.flatDue, { color: rowUi.labelColor }]}>{formatDeadline(a.deadline)}</Text>
      </View>
      <Pressable onPress={() => onHide(a)} hitSlop={8} style={styles.hideBtn}>
        <Ionicons name="eye-off-outline" size={18} color={rowUi.labelColor} />
      </Pressable>
    </PressableRow>
  )
})

const CardRow = memo(function CardRow({
  a,
  now,
  urgent,
  done,
  rowUi,
  onOpen,
  onHide,
}: {
  a: Assignment
  now: Date
  urgent: boolean
  done: boolean
  rowUi: RowUi
  onOpen: (a: Assignment) => void
  onHide: (a: Assignment) => void
}) {
  const rel = relDue(a.deadline, now)
  return (
    <PressableRow
      onPress={() => onOpen(a)}
      onLongPress={() => onHide(a)}
      style={[rowUi.card, urgent && styles.urgent, styles.card]}
    >
      <View style={done ? styles.doneDim : undefined}>
        <View style={styles.rowTop}>
          <Text style={[styles.course, { color: rowUi.labelColor }]} numberOfLines={1}>
            {a.courseName || '科目不明'}
          </Text>
          <Pressable onPress={() => onHide(a)} hitSlop={8} style={styles.hideBtn}>
            <Ionicons name="eye-off-outline" size={18} color={rowUi.labelColor} />
          </Pressable>
        </View>
        <Text style={[styles.title, { color: rowUi.valueColor }]} numberOfLines={2}>
          {a.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.due, { color: rowUi.labelColor }]} numberOfLines={1}>
            {formatDeadline(a.deadline)}
            {rel ? ` ・ ${rel}` : ''}
          </Text>
          <StatusChip status={a.submissionStatus} />
        </View>
      </View>
    </PressableRow>
  )
})

const HiddenRow = memo(function HiddenRow({
  a,
  rowUi,
  onUnhide,
}: {
  a: Assignment
  rowUi: RowUi
  onUnhide: (a: Assignment) => void
}) {
  return (
    <View style={[rowUi.card, styles.flatRow]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.course, { color: rowUi.labelColor }]} numberOfLines={1}>
          {a.courseName || '科目不明'}
        </Text>
        <Text style={[styles.title, { color: rowUi.valueColor }]} numberOfLines={1}>
          {a.title}
        </Text>
      </View>
      <Pressable onPress={() => onUnhide(a)} style={styles.restoreBtn}>
        <Text style={styles.restoreText}>戻す</Text>
      </Pressable>
    </View>
  )
})

const CollapseHeaderRow = memo(function CollapseHeaderRow({
  group,
  label,
  open,
  rowUi,
  onToggle,
}: {
  group: 'overdue' | 'hidden'
  label: string
  open: boolean
  rowUi: RowUi
  onToggle: (group: 'overdue' | 'hidden') => void
}) {
  const color = group === 'overdue' ? OVERDUE_COLOR : rowUi.labelColor
  return (
    <Pressable onPress={() => onToggle(group)} style={[styles.collapseHead, styles.collapseSpacing]}>
      <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={color} />
      <Text style={[styles.collapseText, { color }]}>{label}</Text>
    </Pressable>
  )
})

export default function AssignmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { message: syncNotice, show: showSyncNotice, clear: clearSyncNotice } = useSyncSkipNotice()
  const { assignmentsView } = useDisplaySettings()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [now, setNow] = useState(() => new Date())
  const [filter, setFilter] = useState<AssignmentFilter>('not_submitted')
  // 期限切れ・非表示はデフォルト折りたたみ（主役はこれから迫る締切）。
  const [showOverdue, setShowOverdue] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  // 課題更新（LETUS再スキャン）を「別画面へ遷移」ではなく、この一覧を保ったまま裏で走らせる。
  // 収集は headless の AssignmentCollector に委譲し、進捗はインジケータで示す。完了時に version が
  // 上がって一覧が差分反映される（既存の scanned 一覧に変更を加えていく形）。
  const [collecting, setCollecting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // LETUS課題収集の最終ヘルス（層1の正直表示バナー用）。
  const [health, setHealth] = useState<StoredHealth | null>(null)
  // 課題一覧の鮮度（最終保存成功時刻）。
  const [refreshedAt, setRefreshedAt] = useState(0)

  const startUpdate = useCallback(() => {
    // LETUS定時メンテナンス帯(4:00–5:30)/オフラインは収集不能。押しても無反応にせず理由を短時間表示する。
    // LETUSは出席セッションと無関係なので running(授業中)は渡さない＝attending は発生しない。
    const access = evaluateAccess('letus', { now: new Date(), isOnline: isOnlineNow() })
    const skip = syncSkipReason({ access })
    if (skip) {
      showSyncNotice(syncSkipMessage('letus', skip))
      return
    }
    // 収集開始時は残っているスキップ通知（と自動消去タイマー）を確実に片付ける（HomeScreenと同契約）。
    clearSyncNotice()
    setProgress(null)
    setCollecting(true)
  }, [showSyncNotice, clearSyncNotice])

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
      loadCollectionHealth()
        .then((m) => active && setHealth(m.letusAssignments ?? null))
        .catch(() => undefined)
      loadAssignmentsRefreshedAt().then((at) => active && setRefreshedAt(at)).catch(() => undefined)
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

  const setIgnored = useCallback(
    async (a: Assignment, ignored: boolean) => {
      await mutateAssignments((map) => (map[a.url] ? { ...map, [a.url]: { ...map[a.url], ignored } } : map))
      await reload()
      // 非表示/戻すは通知予約とウィジェットの対象集合を変える。次回収集を待たず即座に貼り直す
      // （旧実装は貼り直さず、非表示にした課題のリマインドが発火し続けた）。失敗は無視（次回収集で回復）。
      refreshAllNotifications().catch(() => undefined)
      notifyWidgetDataChanged()
    },
    [reload],
  )
  const hide = useCallback((a: Assignment) => setIgnored(a, true), [setIgnored])
  const unhide = useCallback((a: Assignment) => setIgnored(a, false), [setIgnored])

  const openDetail = useCallback(
    (a: Assignment) => {
      // 手動課題はLETUS詳細を持たないので編集画面へ。LETUS由来は従来どおり詳細へ。
      if (isManualUrl(a.url)) navigation.navigate('ManualAssignment', { url: a.url })
      else navigation.navigate('LetusAssignmentDetail', { url: a.url })
    },
    [navigation],
  )

  const onToggle = useCallback((group: 'overdue' | 'hidden') => {
    if (group === 'overdue') setShowOverdue((v) => !v)
    else setShowHidden((v) => !v)
  }, [])

  const live = useMemo(() => assignments.filter((a) => !a.ignored), [assignments])
  const hidden = useMemo(() => assignments.filter((a) => a.ignored), [assignments])

  const stats = useMemo(() => {
    const dueToday = live.filter(
      (a) => !isSubmitted(a) && a.deadline && isSameLocalDate(new Date(a.deadline), now),
    ).length
    const notSubmitted = live.filter((a) => !isSubmitted(a)).length
    const submitted = live.filter(isSubmitted).length
    return { dueToday, notSubmitted, submitted }
  }, [live, now])

  // useUi() は毎レンダー新オブジェクトを返す。行の memo を効かせるため、テーマ由来の値だけで安定化する。
  const rowUi = useMemo<RowUi>(
    () => ({
      card: {
        backgroundColor: ui.card.backgroundColor,
        borderColor: ui.card.borderColor,
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
      },
      labelColor: ui.labelColor,
      valueColor: ui.valueColor,
    }),
    [ui.card.backgroundColor, ui.card.borderColor, ui.labelColor, ui.valueColor],
  )

  const listItems = useMemo(
    () =>
      buildAssignmentListItems({
        assignments,
        now,
        filter,
        view: assignmentsView,
        showOverdue,
        showHidden,
      }),
    [assignments, now, filter, assignmentsView, showOverdue, showHidden],
  )

  const keyExtractor = useCallback((item: ListItem) => item.key, [])

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      switch (item.type) {
        case 'assignment':
          return item.variant === 'flat' ? (
            <FlatRow a={item.a} now={now} rowUi={rowUi} onOpen={openDetail} onHide={hide} />
          ) : (
            <CardRow
              a={item.a}
              now={now}
              urgent={item.urgent}
              done={item.done}
              rowUi={rowUi}
              onOpen={openDetail}
              onHide={hide}
            />
          )
        case 'sectionHeader':
          return <SectionLabel>{item.label}</SectionLabel>
        case 'collapseHeader':
          return (
            <CollapseHeaderRow group={item.group} label={item.label} open={item.open} rowUi={rowUi} onToggle={onToggle} />
          )
        case 'hiddenRow':
          return <HiddenRow a={item.a} rowUi={rowUi} onUnhide={unhide} />
        case 'note':
          return <Text style={[styles.note, { color: rowUi.labelColor }]}>{item.label}</Text>
      }
    },
    [now, rowUi, openDetail, hide, unhide, onToggle],
  )

  const listHeader =
    assignmentsView === 'flat' ? (
      <View>
        <View style={[rowUi.card, styles.statsRow]}>
          <View style={styles.statCol}>
            <Text style={[styles.statNum, { color: OVERDUE_COLOR }]}>{stats.dueToday}</Text>
            <Text style={[styles.statLabel, { color: rowUi.labelColor }]}>今日締切</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={[styles.statNum, { color: rowUi.valueColor }]}>{stats.notSubmitted}</Text>
            <Text style={[styles.statLabel, { color: rowUi.labelColor }]}>未提出</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={[styles.statNum, { color: rowUi.valueColor }]}>{stats.submitted}</Text>
            <Text style={[styles.statLabel, { color: rowUi.labelColor }]}>提出済み</Text>
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
        <View style={{ height: 12 }} />
      </View>
    ) : null

  const isEmpty = live.length === 0 && hidden.length === 0

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

      <KillSwitchBanner feature="letus" />
      <HealthBanner health={health?.health} source="letus" />
      <FreshnessLabel at={refreshedAt} />
      {syncNotice ? (
        <Text style={[styles.syncNotice, { color: ui.labelColor }]}>{syncNotice}</Text>
      ) : null}

      {/* 更新中インジケータ（一覧はそのまま下に表示し続ける）。 */}
      {collecting ? (
        <View style={[rowUi.card, styles.updatingBar]}>
          <ActivityIndicator size="small" color={COLORS.emerald} />
          <Text style={[styles.updatingText, { color: rowUi.valueColor }]} numberOfLines={1}>
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
            loadCollectionHealth().then((m) => setHealth(m.letusAssignments ?? null)).catch(() => undefined)
            loadAssignmentsRefreshedAt().then(setRefreshedAt).catch(() => undefined)
          }}
        />
      ) : null}

      {isEmpty ? (
        <View style={[rowUi.card, { marginTop: 16 }]}>
          <Text style={{ color: rowUi.valueColor }}>
            表示できる課題がありません。「更新」でLETUSから取得、「追加」で手動でも登録できます。
          </Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={listItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[styles.list, { paddingBottom: clearance }]}
          removeClippedSubviews
          initialNumToRender={12}
          windowSize={11}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: 4, paddingBottom: 24 },
  card: { marginBottom: 9 },
  doneDim: { opacity: 0.72 },
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
  flatRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9 },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  manualBadge: { backgroundColor: '#e5f3ec', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  manualBadgeText: { fontSize: 10, color: COLORS.emeraldDark, fontWeight: '700' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  flatRight: { alignItems: 'flex-end' },
  flatRel: { fontSize: 13, fontWeight: '700' },
  flatDue: { fontSize: 11, marginTop: 2 },
  hideBtn: { padding: 4, marginLeft: 2 },
  collapseHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginLeft: 2 },
  collapseSpacing: { marginTop: 14 },
  collapseText: { fontSize: 13, fontWeight: '600' },
  note: { marginLeft: 2 },
  restoreBtn: { backgroundColor: '#eef5f2', borderWidth: 1, borderColor: '#b9ddcd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  restoreText: { color: COLORS.emeraldDark, fontSize: 13, fontWeight: '600' },
  syncNotice: { fontSize: 11, marginBottom: 8, marginLeft: 2 },
})
