import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from '../ui/Text'
import { PressableRow } from '../ui/Pressable'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadAssignments, mutateAssignments } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'
import { isManualUrl } from '../assignments/manualAssignment'
import {
  buildAssignmentListItems,
  type AssignmentFilter,
  type ListItem,
} from '../assignments/assignmentListItems'
import type { AssignmentsStackParamList } from '../navigation/types'
import { Chip, ScreenBg, ScreenHeader, Segmented, useUi, useTabBarClearance } from '../ui/screen'
import { SwipeToHide } from '../ui/SwipeToHide'
import { useDisplaySettings } from '../displaySettings'
import { formatDeadline, isSubmitted, relDue, TONE_COLOR, urgencyTone, formatDeadlineRich, deadlineMagnitude } from '../assignments/deadline'
import { assignmentsEmptyState } from '../assignments/emptyState'
import { RADIUS } from '../ui/scale'
import HealthBanner from '../ui/HealthBanner'
import KillSwitchBanner from '../ui/KillSwitchBanner'
import { syncSkipMessage } from '../health/syncSkipNotice'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { notifyWidgetDataChanged } from '../widget/updateWidget'
import FreshnessLabel from '../ui/FreshnessLabel'
import { useSync } from '../sync/SyncProvider'
import { COLORS } from '../theme'

type RowUi = {
  card: ViewStyle
  labelColor: string
  valueColor: string
  danger: string
  warn: string
  chipBg: string
  successBg: string
  success: string
  chevron: string
  divider: string
  dangerBg: string
  softBg: string
  chipText: string
  accent: string
}

function ChipDone({ rowUi }: { rowUi: RowUi }) {
  return (
    <View style={[styles.chipDone, { backgroundColor: rowUi.successBg }]}>
      <Ionicons name="checkmark" size={11} color={rowUi.success} />
      <Text style={[styles.chipDoneText, { color: rowUi.success }]}>提出済み</Text>
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
    <SwipeToHide onHide={() => onHide(a)} radius={18} style={styles.flatRowGap}>
    <PressableRow onPress={() => onOpen(a)} onLongPress={() => onHide(a)} style={[rowUi.card, styles.flatRow, styles.noMb]}>
      <View style={[styles.dot, { backgroundColor: TONE_COLOR[tone] }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.courseRow}>
          <Text style={[styles.course, { color: rowUi.labelColor }]} numberOfLines={1}>
            {a.courseName || '科目不明'}
          </Text>
          {isManualUrl(a.url) ? (
            <View style={[styles.manualBadge, { backgroundColor: rowUi.chipBg }]}>
              <Text style={[styles.manualBadgeText, { color: rowUi.chipText }]}>手動</Text>
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
    </SwipeToHide>
  )
})

// 期限グルーピング（バケット）表示の行＝フラット面＋ヘアライン区切り（個別カード化しない）。
const AssignRow = memo(function AssignRow({
  a,
  now,
  done,
  firstInGroup,
  rowUi,
  onOpen,
  onHide,
}: {
  a: Assignment
  now: Date
  done: boolean
  firstInGroup: boolean
  rowUi: RowUi
  onOpen: (a: Assignment) => void
  onHide: (a: Assignment) => void
}) {
  const submitted = done || isSubmitted(a)
  const tone = submitted ? 'gray' : urgencyTone(a, now)
  const dColor = tone === 'red' ? rowUi.danger : tone === 'amber' ? rowUi.warn : rowUi.labelColor
  const dWeight: '400' | '500' | '700' = tone === 'red' ? '700' : tone === 'amber' ? '500' : '400'
  const mag = submitted ? '' : deadlineMagnitude(a.deadline, now)
  return (
    <SwipeToHide onHide={() => onHide(a)}>
    <PressableRow
      onPress={() => onOpen(a)}
      onLongPress={() => onHide(a)}
      style={[
        styles.assignRow,
        { backgroundColor: rowUi.card.backgroundColor },
        !firstInGroup && { borderTopWidth: 1, borderTopColor: rowUi.divider },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.rowTitle, { color: submitted ? rowUi.labelColor : rowUi.valueColor, fontWeight: submitted ? '400' : '500' }]}
          numberOfLines={2}
        >
          {a.title}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={[styles.subject, { color: rowUi.labelColor }]} numberOfLines={1}>
            {a.courseName || '科目不明'}
          </Text>
          {isManualUrl(a.url) ? (
            <View style={[styles.manualBadge, { backgroundColor: rowUi.chipBg }]}>
              <Text style={[styles.manualBadgeText, { color: rowUi.chipText }]}>手動</Text>
            </View>
          ) : null}
          <Text style={[styles.metaDot, { color: rowUi.chevron }]}>·</Text>
          <View style={styles.deadline}>
            <Ionicons name="time-outline" size={12} color={dColor} />
            <Text style={[styles.deadlineText, { color: dColor, fontWeight: dWeight }]} numberOfLines={1}>
              {formatDeadlineRich(a.deadline, now)}
              {mag ? ` · ${mag}` : ''}
            </Text>
          </View>
        </View>
      </View>
      {submitted ? <ChipDone rowUi={rowUi} /> : <Ionicons name="chevron-forward" size={16} color={rowUi.chevron} />}
    </PressableRow>
    </SwipeToHide>
  )
})

// 期限グループの見出し（読書面のヘアライン帯）。期限切れは意味色danger＋一括非表示。
const GroupHeader = memo(function GroupHeader({
  label,
  count,
  overdue,
  collapsible,
  open,
  rowUi,
  onBulkHide,
  onToggle,
}: {
  label: string
  count: number
  overdue: boolean
  collapsible: boolean
  open: boolean
  rowUi: RowUi
  onBulkHide: () => void
  onToggle: (group: 'overdue' | 'hidden') => void
}) {
  const labelColor = overdue ? rowUi.danger : rowUi.labelColor
  return (
    <View style={[styles.ghead, { backgroundColor: rowUi.softBg, borderBottomColor: rowUi.divider }]}>
      {collapsible ? (
        <Pressable onPress={() => onToggle('overdue')} hitSlop={6} style={styles.gheadToggle}>
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={15} color={labelColor} />
          <Text style={[styles.glabel, { color: labelColor }]}>{label}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.glabel, { color: labelColor }]}>{label}</Text>
      )}
      {overdue ? (
        <View style={[styles.gcountDanger, { backgroundColor: rowUi.dangerBg }]}>
          <Text style={[styles.gcountDangerText, { color: rowUi.danger }]}>{count}</Text>
        </View>
      ) : (
        <Text style={[styles.gcount, { color: rowUi.labelColor }]}>{count}</Text>
      )}
      {overdue ? (
        <Pressable onPress={onBulkHide} hitSlop={6} style={[styles.bulk, { borderColor: rowUi.divider }]}>
          <Ionicons name="eye-off-outline" size={12} color={rowUi.labelColor} />
          <Text style={[styles.bulkText, { color: rowUi.valueColor }]}>まとめて非表示</Text>
        </Pressable>
      ) : null}
    </View>
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
      <Pressable onPress={() => onUnhide(a)} style={[styles.restoreBtn, { backgroundColor: rowUi.softBg, borderColor: rowUi.card.borderColor }]}>
        <Text style={[styles.restoreText, { color: rowUi.chipText }]}>戻す</Text>
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
  const color = group === 'overdue' ? rowUi.danger : rowUi.labelColor
  return (
    <Pressable onPress={() => onToggle(group)} style={[styles.collapseHead, styles.collapseSpacing]}>
      <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={color} />
      <Text style={[styles.collapseText, { color }]}>{label}</Text>
    </Pressable>
  )
})

// 空状態3類型（祝福 / 未同期CTA / 取得エラー説明）。「取得失敗かゼロか不明」を排除する。
function EmptyView({ state, refreshedAt, onSync }: { state: 'done' | 'unsynced' | 'error'; refreshedAt: number; onSync: () => void }) {
  const ui = useUi()
  if (state === 'done') {
    return (
      <View style={styles.empty}>
        <View style={[styles.emptyBadge, { backgroundColor: ui.colors.successBg }]}>
          <Ionicons name="checkmark-circle" size={40} color={ui.colors.success} />
        </View>
        <Text style={[styles.emptyTitle, { color: ui.heading }]}>すべて提出済み</Text>
        <Text style={[styles.emptyBody, { color: ui.valueColor }]}>今学期の未提出課題はありません。おつかれさまでした。</Text>
        <Text style={[styles.emptySub, { color: ui.labelColor }]}>提出済みの課題はフィルタ「提出済み」から確認できます</Text>
      </View>
    )
  }
  if (state === 'unsynced') {
    return (
      <View style={styles.empty}>
        <View style={[styles.emptyBadge, { backgroundColor: ui.softBoxBg }]}>
          <Ionicons name="cloud-offline-outline" size={40} color={ui.pick(COLORS.emeraldDark, COLORS.emeraldDark, COLORS.emeraldLight)} />
        </View>
        <Text style={[styles.emptyTitle, { color: ui.heading }]}>まだ同期していません</Text>
        <Text style={[styles.emptyBody, { color: ui.valueColor }]}>LETUSと同期すると、履修中の科目の課題と締切がここに表示されます。</Text>
        <Pressable onPress={onSync} style={[styles.cta, { backgroundColor: ui.pick(COLORS.cta, COLORS.emerald, COLORS.emeraldLight) }]}>
          <Ionicons name="refresh" size={16} color={ui.pick(COLORS.white, COLORS.white, COLORS.ink)} />
          <Text style={[styles.ctaText, { color: ui.pick(COLORS.white, COLORS.white, COLORS.ink) }]}>LETUSと同期する</Text>
        </Pressable>
        <Text style={[styles.emptySub, { color: ui.labelColor }]}>同期には学内アカウントでのログインが必要です</Text>
      </View>
    )
  }
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyBadge, { backgroundColor: ui.colors.dangerBg }]}>
        <Ionicons name="warning-outline" size={40} color={ui.colors.danger} />
      </View>
      <Text style={[styles.emptyTitle, { color: ui.heading }]}>課題を取得できませんでした</Text>
      <Text style={[styles.emptyBody, { color: ui.valueColor }]}>
        LETUSに接続できませんでした。学内ネットワークの状態と、LETUSのメンテナンス時間（毎日 4:00〜5:00）をご確認ください。
      </Text>
      <Pressable onPress={onSync} style={[styles.btnGhost, { backgroundColor: ui.softBoxBg, borderColor: ui.dividerColor }]}>
        <Ionicons name="refresh" size={14} color={ui.labelColor} />
        <Text style={[styles.btnGhostText, { color: ui.valueColor }]}>再試行</Text>
      </Pressable>
      {refreshedAt > 0 ? <Text style={[styles.emptySub, { color: ui.labelColor }]}>最終同期の内容を保持しています</Text> : null}
    </View>
  )
}

export default function AssignmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { assignmentsView } = useDisplaySettings()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [now, setNow] = useState(() => new Date())
  const [filter, setFilter] = useState<AssignmentFilter>('not_submitted')
  // 期限切れ・非表示はデフォルト折りたたみ（主役はこれから迫る締切）。
  const [showOverdue, setShowOverdue] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  // 課題更新（LETUSフル同期）は SyncProvider が単独所有。この画面は runner を呼び、
  // 進捗（assignmentBusy/assignmentProgress）を購読してバーを完了まで表示する。ホーム発の
  // 統合同期（掲示→課題）の課題フェーズも同じ状態に載るので、画面を跨いでも進捗が途切れない。
  const sync = useSync()
  const collecting = sync.assignmentBusy
  // LETUS収集のヘルス（層1の正直表示バナー用）・鮮度・スキップ理由は Provider が完了ごとに反映する。
  const health = sync.letusHealth
  const refreshedAt = sync.lastAssignmentsAt
  // この画面では LETUS 起因のスキップだけ表示する（CLASS掲示のスキップはホームの同期バーが持つ）。
  const syncNotice = sync.skip?.feature === 'letus' ? syncSkipMessage('letus', sync.skip.reason) : ''

  const startUpdate = useCallback(() => {
    sync.runAssignmentsSync({ source: 'user' })
  }, [sync])

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

  const overdueLive = useMemo(
    () =>
      live.filter(
        (a) =>
          !isSubmitted(a) &&
          a.lifecycleStatus !== 'submitted' &&
          a.lifecycleStatus !== 'before_start' &&
          a.deadline !== null &&
          new Date(a.deadline).getTime() < now.getTime(),
      ),
    [live, now],
  )
  const stats = useMemo(() => {
    const notSubmitted = live.filter((a) => !isSubmitted(a)).length
    const submitted = live.filter(isSubmitted).length
    return { notSubmitted, submitted, overdue: overdueLive.length }
  }, [live, overdueLive])

  const bulkHideOverdue = useCallback(async () => {
    if (overdueLive.length === 0) return
    const urls = new Set(overdueLive.map((a) => a.url))
    await mutateAssignments((map) => {
      const next = { ...map }
      for (const u of urls) if (next[u]) next[u] = { ...next[u], ignored: true }
      return next
    })
    await reload()
    refreshAllNotifications().catch(() => undefined)
    notifyWidgetDataChanged()
  }, [overdueLive, reload])

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
      danger: ui.colors.danger,
      warn: ui.colors.warn,
      chipBg: ui.colors.chipBg,
      successBg: ui.colors.successBg,
      success: ui.colors.success,
      chevron: ui.chevron,
      divider: ui.dividerColor,
      dangerBg: ui.colors.dangerBg,
      softBg: ui.softBoxBg,
      chipText: ui.colors.chipText,
      accent: ui.pick(COLORS.emerald, COLORS.emerald, COLORS.emeraldLight),
    }),
    [
      ui.card.backgroundColor,
      ui.card.borderColor,
      ui.labelColor,
      ui.valueColor,
      ui.colors.danger,
      ui.colors.warn,
      ui.colors.chipBg,
      ui.colors.successBg,
      ui.colors.success,
      ui.chevron,
      ui.dividerColor,
      ui.colors.dangerBg,
      ui.softBoxBg,
      ui.colors.chipText,
      ui.variant,
    ],
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
            <AssignRow
              a={item.a}
              now={now}
              done={item.done}
              firstInGroup={item.firstInGroup}
              rowUi={rowUi}
              onOpen={openDetail}
              onHide={hide}
            />
          )
        case 'sectionHeader':
          return (
            <GroupHeader
              label={item.label}
              count={item.count}
              overdue={item.group === 'overdue'}
              collapsible={!!item.collapsible}
              open={!!item.open}
              rowUi={rowUi}
              onBulkHide={bulkHideOverdue}
              onToggle={onToggle}
            />
          )
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
    [now, rowUi, openDetail, hide, unhide, onToggle, bulkHideOverdue],
  )

  const listHeader = (
    <View>
      <View style={[rowUi.card, styles.statsRow]}>
        <View style={styles.statCol}>
          <Text style={[styles.statNum, { color: rowUi.valueColor }]}>{stats.notSubmitted}</Text>
          <Text style={[styles.statLabel, { color: rowUi.labelColor }]}>未提出</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: rowUi.divider }]} />
        <View style={styles.statCol}>
          <Text style={[styles.statNum, { color: stats.overdue > 0 ? ui.colors.danger : rowUi.valueColor }]}>{stats.overdue}</Text>
          <Text style={[styles.statLabel, { color: rowUi.labelColor }]}>期限切れ</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: rowUi.divider }]} />
        <View style={styles.statCol}>
          <Text style={[styles.statNum, { color: rowUi.valueColor }]}>{stats.submitted}</Text>
          <Text style={[styles.statLabel, { color: rowUi.labelColor }]}>提出済み</Text>
        </View>
      </View>
      <Segmented
        options={[
          { key: 'all', label: `すべて ${live.length}` },
          { key: 'not_submitted', label: `未提出 ${stats.notSubmitted}` },
          { key: 'submitted', label: `提出済み ${stats.submitted}` },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <View style={{ height: 8 }} />
    </View>
  )

  const healthStatus = health?.health?.status
  const healthOk = !healthStatus || (healthStatus !== 'not_logged_in' && healthStatus !== 'maintenance' && healthStatus !== 'blocked')
  const emptyState = assignmentsEmptyState({
    liveCount: live.length,
    notSubmittedCount: stats.notSubmitted,
    submittedCount: stats.submitted,
    refreshedAt,
    healthOk,
    filter,
  })
  // 全部非表示(live=0だが hidden>0)のときは空状態でなく一覧（非表示の折りたたみ）を見せる。
  const showEmpty = emptyState !== null && !(live.length === 0 && hidden.length > 0)

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

      {/* 更新中インジケータ（一覧はそのまま下に表示し続ける）。収集本体は SyncProvider が
          マウントし、ステージ文言（コース取込/内容確認/課題取込 n/m）をそのまま表示する。 */}
      {collecting ? (
        <View style={[rowUi.card, styles.updatingBar]}>
          <ActivityIndicator size="small" color={rowUi.accent} />
          <Text style={[styles.updatingText, { color: rowUi.valueColor }]} numberOfLines={1}>
            {sync.assignmentProgress ?? '課題を更新中…'}
          </Text>
        </View>
      ) : null}

      {showEmpty && emptyState ? (
        <EmptyView state={emptyState} refreshedAt={refreshedAt} onSync={startUpdate} />
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
  updatingBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingVertical: 12 },
  updatingText: { fontSize: 13, fontWeight: '600', flex: 1 },
  // 統計（ガラスカード・中央寄せ＋区切り）
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statCol: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, alignSelf: 'stretch', marginVertical: 2 },
  statNum: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2 },
  // バケット行（フラット＋ヘアライン）
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rowTitle: { fontSize: 14, lineHeight: 18 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  subject: { fontSize: 11, maxWidth: 160 },
  metaDot: { fontSize: 11 },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  deadlineText: { fontSize: 11 },
  chipDone: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipDoneText: { fontSize: 11, fontWeight: '700' },
  // グループ見出し
  ghead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 14, borderBottomWidth: 1, marginTop: 10 },
  gheadToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  glabel: { fontSize: 12, fontWeight: '500', letterSpacing: 0.3 },
  gcount: { fontSize: 11 },
  gcountDanger: { borderRadius: RADIUS.pill, paddingHorizontal: 7, paddingVertical: 1 },
  gcountDangerText: { fontSize: 11, fontWeight: '700' },
  bulk: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  bulkText: { fontSize: 11, fontWeight: '500' },
  // 空状態3類型
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  emptyBadge: { width: 88, height: 88, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  emptyBody: { fontSize: 16, lineHeight: 25, textAlign: 'center', maxWidth: 300 },
  emptySub: { fontSize: 11, textAlign: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: RADIUS.pill, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4 },
  ctaText: { fontSize: 15, fontWeight: '700' },
  btnGhost: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
  btnGhostText: { fontSize: 14, fontWeight: '500' },
  // flat表示（設定送り）・非表示・折りたたみ（維持）
  course: { fontSize: 11 },
  title: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  flatRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9 },
  // FlatRow は SwipeToHide でラップするため行間マージンを外側ラッパーへ移す（背後層の高さを前景カードに一致させる）。HiddenRow は flatRow のまま。
  flatRowGap: { marginBottom: 9 },
  noMb: { marginBottom: 0 },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  manualBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
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
  restoreBtn: { backgroundColor: COLORS.tint, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  restoreText: { color: COLORS.emeraldDark, fontSize: 13, fontWeight: '600' },
  syncNotice: { fontSize: 11, marginBottom: 8, marginLeft: 2 },
})
