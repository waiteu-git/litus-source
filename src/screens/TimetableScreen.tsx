import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadTimetable } from '../storage/timetableStore'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { DayOfWeek } from '../parsers/timetable'
import type { TimetableStackParamList } from '../navigation/types'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'
import { isTimetableStale, loadTimetableRefreshedAt } from '../storage/refreshMetaStore'
import { loadCollectionHealth } from '../storage/collectionHealthStore'
import type { StoredHealth } from '../storage/collectionHealthSerialize'
import HealthBanner from '../ui/HealthBanner'
import FreshnessLabel from '../ui/FreshnessLabel'
import { evaluateAccess } from '../health/accessGate'
import { isOnlineNow } from '../health/connectivity'
import { syncSkipMessage, syncSkipReason } from '../health/syncSkipNotice'
import { useSyncSkipNotice } from '../ui/useSyncSkipNotice'
import TimetableSyncEngine from '../collect/TimetableSyncEngine'
import { currentPeriodNumber } from '../attendance/classPeriod'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { NowPulse } from '../ui/NowPulse'
import { loadWeeklyPatterns } from '../storage/weeklyPatternStore'
import type { WeeklyPatternMap } from '../storage/weeklyPatternSerialize'
import { isClassOnDate } from '../timetableEvents/weeklyPattern'
import { Chip, ScreenBg, ScreenHeader, Segmented, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS } from '../theme'
import { useDisplaySettings } from '../displaySettings'
import { loadClassEvents } from '../storage/classEventsStore'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { pickCellEvent, upcomingMakeups } from '../timetableEvents/eventSelectors'
import { cellBadgeText, shortDate } from '../timetableEvents/eventLabels'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import AttendanceStatsSyncEngine from '../collect/AttendanceStatsSyncEngine'
import { loadAttendanceStats } from '../storage/attendanceStatsStore'
import { loadAttendanceOverrides } from '../storage/attendanceOverridesStore'
import { computeAttendanceRisk } from '../attendance/attendanceRisk'
import { loadPersonalEvents } from '../storage/personalEventsStore'
import type { PersonalEvent, PersonalDayKey } from '../timetableEvents/personalEvent'
import { personalEventAt, daysWithPersonal, hasZeroPeriod, personalEventsOfDay } from '../timetableEvents/personalEventSelectors'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import { courseUnreadCounts } from '../timetableEvents/courseUnread'
import { swipeTargetDay, type SwipeDirection } from '../timetableEvents/daySwipe'
import { shouldShowTodayPill } from '../timetableEvents/todayPill'
import { DUR, EASE, SHIFT } from '../ui/motion'
import { Badge } from '../ui/Badge'

const WEEKDAY_KEY: Record<number, DayKey | undefined> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type DayKey = (typeof DAY_ORDER)[number]
const DAY_LABEL: Record<DayKey, string> = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日' }
const TODAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

type ClassEntry = TimetableCollection['slots'][number]['classes'][number]

export default function TimetableScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { timetableView } = useDisplaySettings()
  // 授業中（出席WebViewが稼働／CLASSセッションを専有中）フラグ。手動更新の授業中ガードに使う。
  const { running } = useAttendanceEngine()
  const [collections, setCollections] = useState<TimetableCollection[] | null>(null)
  const [updatedCodes, setUpdatedCodes] = useState<Set<string>>(new Set())
  const [events, setEvents] = useState<ClassEvent[]>([])
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([])
  const [patterns, setPatterns] = useState<WeeklyPatternMap>({})
  const { version: eventsVersion } = useClassEventsVersion()
  const [selCol, setSelCol] = useState(0)
  // 現在時刻（当該コマ強調用）。分単位で十分なので30秒ごとに更新。
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])
  const todayKey = TODAY_KEYS[now.getDay()]
  const [selDay, setSelDay] = useState<DayKey>(TODAY_KEYS[new Date().getDay()])
  // selDay が自動選択（今日）由来か、ユーザーが手動でタブを選んだ結果かを追跡する。
  // 土日は col/personalEvents の非同期ロード前後で `days` に出たり消えたりするため、
  // 自動選択中に今日が有効になった/無効になったタイミングで selDay を追従・是正する。
  const selDayAutoRef = useRef(true)
  // 時間割の裏取得中フラグ。true の間だけ headless エンジンをマウントして収集する。
  const [syncing, setSyncing] = useState(false)
  // 出欠統計の裏取得中フラグ。時間割収集の完了後にのみ true にする（CLASSセッションの同時アクセスを避けるため）。
  const [attendanceSyncing, setAttendanceSyncing] = useState(false)
  // 時間割収集の最終ヘルス（層1の正直表示バナー用）。
  const [health, setHealth] = useState<StoredHealth | null>(null)
  // 時間割の鮮度時刻（キャッシュ閲覧保証：常設ラベルでいつ取得した情報かを伝える）。
  const [refreshedAt, setRefreshedAt] = useState(0)
  // 多重起動防止（非同期スロットル判定中の再入も弾く）。setSyncing更新関数の中で副作用を起こさない。
  const syncingRef = useRef(false)
  // 出欠危険/警告に該当する科目コード集合（グリッドの赤バッジ用）。
  const [dangerCodes, setDangerCodes] = useState<Set<string>>(new Set())
  // 未読掲示のある科目コード集合（グリッド/リストの未読ドット用・保存済み掲示digestから算出）。
  const [unreadCodes, setUnreadCodes] = useState<Set<string>>(new Set())
  // 手動更新をガードでスキップした理由の一時表示（リリースでも出す）。
  const { message: syncNotice, show: showSyncNotice, clear: clearSyncNotice } = useSyncSkipNotice()

  const reloadAttendance = () => {
    ;(async () => {
      const data = await loadAttendanceStats()
      const ov = await loadAttendanceOverrides()
      const danger = new Set<string>()
      for (const c of data?.courses ?? []) {
        if (!c.courseCode) continue
        const r = computeAttendanceRisk(c, ov[c.courseCode]?.total != null ? { totalOverride: ov[c.courseCode]!.total } : undefined)
        if (r.trackable && (r.level === 'danger' || r.level === 'warning')) danger.add(c.courseCode)
      }
      setDangerCodes(danger)
    })().catch(() => undefined)
  }

  useEffect(() => {
    reloadAttendance()
  }, [])

  // 時間割の裏取得を開始する。force=false ならスロットル（前回更新から時間が経っている時だけ）。
  const startSync = useCallback((force: boolean) => {
    if (syncingRef.current) return // 実行中/開始判定中は多重起動しない
    // CLASS定時メンテナンス帯/オフラインは収集不能。手動(force=引っ張り)時はスキップ理由を短時間表示する。
    // running(授業中)は Home と同様にガードする: 授業中は収集が背景の出席WebViewをアンマウントして
    // プリエンプトする（classViewArbiter＋shouldRender=running&&!collectActive）ため、静的で実益の薄い
    // 授業中の時間割手動更新は控える（'attending' を表示）。
    const access = evaluateAccess('class', { now: new Date(), isOnline: isOnlineNow() })
    const skip = syncSkipReason({ access, running })
    if (skip) {
      if (force) showSyncNotice(syncSkipMessage('class', skip))
      return
    }
    const begin = () => {
      // 収集開始時は残っているスキップ通知（と自動消去タイマー）を確実に片付ける（HomeScreenと同契約）。
      clearSyncNotice()
      syncingRef.current = true
      setSyncing(true)
    }
    if (force) {
      begin()
      return
    }
    loadTimetableRefreshedAt()
      .then((at) => {
        if (!syncingRef.current && isTimetableStale(at)) begin()
      })
      .catch(() => undefined)
  }, [showSyncNotice, clearSyncNotice, running])

  useEffect(() => {
    loadClassEvents().then(setEvents).catch(() => undefined)
  }, [eventsVersion])

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadTimetable().then((c) => {
        if (active) setCollections(c)
      })
      loadClassEvents().then((e) => { if (active) setEvents(e) }).catch(() => undefined)
      loadPersonalEvents().then((list) => {
        if (active) setPersonalEvents(list)
      }).catch(() => undefined)
      loadWeeklyPatterns().then((m) => { if (active) setPatterns(m) }).catch(() => undefined)
      loadCollectionHealth().then((m) => { if (active) setHealth(m.timetable ?? null) }).catch(() => undefined)
      reloadAttendance()
      loadTimetableRefreshedAt().then((at) => { if (active) setRefreshedAt(at) }).catch(() => undefined)
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
      ;(async () => {
        const digest = await loadBulletinDigest()
        const cols = await loadTimetable()
        const codes = new Set<string>()
        for (const c of cols ?? []) for (const s of c.slots) for (const cl of s.classes) if (cl.courseCode) codes.add(cl.courseCode)
        const counts = courseUnreadCounts(digest, codes)
        if (active) setUnreadCodes(new Set(counts.keys()))
      })().catch(() => undefined)
      // フォーカスでの自動裏取得はしない（出席以外でCLASSを不用意に開かない）。更新は引き下げで明示的に。
      return () => {
        active = false
      }
    }, []),
  )

  const col = collections && collections.length > 0 ? collections[Math.min(selCol, collections.length - 1)] : null
  // 今この瞬間が属する時限（当該コマ強調用）。どの時限でもなければ null。
  const curPeriod = currentPeriodNumber(col?.periodTimes ?? null, now)
  const hasSat = !!col?.slots.some((s) => s.day === 'sat')
  const personalDays = daysWithPersonal(personalEvents)
  const hasSun = personalDays.has('sun')
  const days = DAY_ORDER.filter((d) => (d === 'sat' ? hasSat || personalDays.has('sat') : d === 'sun' ? hasSun : true))

  // selDay は常に days の要素でなければならない（土日は非同期ロード前後で days に出入りするため）。
  // - 現在の selDay が days から外れた場合: 今日が有効ならそこへ、無ければ 'mon' へ是正する（自動選択扱い）。
  // - selDay が有効なままの場合: 自動選択中（ユーザーがタブを手動選択していない）かつ今日が
  //   新たに有効になったなら、今日へ追従する（例: 日曜の個人予定ロード完了後に 'sun' へ戻る）。
  //   ユーザーが手動で別タブを選んだ後は追従しない。
  useEffect(() => {
    if (days.includes(selDay)) {
      if (selDayAutoRef.current && selDay !== todayKey && days.includes(todayKey)) {
        setSelDay(todayKey)
      }
      return
    }
    selDayAutoRef.current = true
    setSelDay(days.includes(todayKey) ? todayKey : 'mon')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join(','), todayKey])

  // リスト表示のコンテンツ領域を左右スワイプで曜日移動する。
  // 縦ScrollView＋pull-to-refreshと共存させるため、capture段のmove判定で
  // 「横方向が明確に優勢なドラッグ」だけを奪う（タップ・縦スクロールは素通し）。
  // days/selDay はレンダーごとに変わるので ref 経由で最新値を参照する。
  const swipeStateRef = useRef({ days, selDay, enabled: false })
  swipeStateRef.current = { days, selDay, enabled: timetableView === 'list' && !!col }
  const swipeShift = useRef(new Animated.Value(0)).current
  const swipeOpacity = useRef(new Animated.Value(1)).current
  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        swipeStateRef.current.enabled && Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 40) return
        const dir: SwipeDirection = g.dx < 0 ? 'next' : 'prev'
        const { days: ds, selDay: cur } = swipeStateRef.current
        const target = swipeTargetDay(ds, cur, dir)
        if (!target) return
        selDayAutoRef.current = false // スワイプもタブ手動選択と同じ扱い（今日への自動追従を止める）
        setSelDay(target)
        // 移動方向から新しい曜日が滑り込む控えめなフィードバック（既存モーショントークンと同トーン）。
        swipeShift.setValue(dir === 'next' ? SHIFT.medium : -SHIFT.medium)
        swipeOpacity.setValue(0.3)
        Animated.parallel([
          Animated.timing(swipeShift, { toValue: 0, duration: DUR.base, easing: EASE.enter, useNativeDriver: true }),
          Animated.timing(swipeOpacity, { toValue: 1, duration: DUR.base, easing: EASE.enter, useNativeDriver: true }),
        ]).start()
      },
    }),
  ).current

  const daySlots = col ? col.slots.filter((s) => s.day === selDay).sort((a, b) => a.period - b.period) : []
  // 選択曜日に落ちる補講オカレンス（休講内包＋単独）。時間割の通常コマとは別に一回限りで表示。
  const dayMakeups = upcomingMakeups(events, now).filter((m) => WEEKDAY_KEY[new Date(m.date).getDay()] === selDay)
  const startTime = (period: number) => col?.periodTimes?.periods.find((p) => p.period === period)?.start ?? ''

  // グリッド表示用: 授業がある最大時限まで（最低6限は確保）。
  const periods = useMemo(() => {
    if (!col) return []
    let max = 6
    for (const s of col.slots) if (s.period > max) max = s.period
    const base = Array.from({ length: max }, (_, i) => i + 1)
    return hasZeroPeriod(personalEvents) ? [0, ...base] : base
  }, [col, personalEvents])

  function slotAt(day: DayKey, period: number) {
    return col?.slots.find((s) => s.day === day && s.period === period) ?? null
  }

  function openSubject(cl: ClassEntry, day: DayOfWeek, period: number) {
    navigation.navigate('SubjectDetail', {
      courseCode: cl.courseCode,
      name: cl.name,
      day: DAY_LABEL[day],
      dayKey: day,
      period,
      room: cl.room,
      teachers: cl.teachers,
      isRemote: cl.isRemote,
    })
  }

  const refresh = (
    <RefreshControl refreshing={syncing} onRefresh={() => startSync(true)} tintColor={COLORS.emerald} colors={[COLORS.emerald]} />
  )

  const cellBg = ui.colors.gridCellEmptyBg
  const cellFilledBg = ui.colors.gridCellFilledBg
  const cellTodayBg = ui.colors.gridCellTodayBg
  const cellNowBg = ui.colors.gridCellNowBg
  const cellTextColor = ui.colors.gridCellText

  // 「今日へ戻る」: リストで今日以外を見ているとき、今日へ一発で戻し自動追従も戻す。
  const showTodayPill = shouldShowTodayPill({ view: timetableView, selDay, todayKey, days })
  const returnToToday = () => {
    selDayAutoRef.current = true
    setSelDay(todayKey)
  }

  return (
    <ScreenBg>
      <ScreenHeader
        title="時間割"
        icon="calendar-outline"
        right={
          syncing ? (
            <Chip label="更新中…" />
          ) : (
            <>
              <Chip label="コース" icon="book-outline" onPress={() => navigation.navigate('LetusCourses')} />
              <Chip label="個人予定" icon="add-outline" onPress={() => navigation.navigate('PersonalEventForm', {})} />
            </>
          )
        }
      />

      {collections && collections.length > 1 ? (
        <Segmented
          options={collections.map((_, i) => ({ key: String(i), label: `時間割${i + 1}` }))}
          value={String(selCol)}
          onChange={(k) => setSelCol(Number(k))}
        />
      ) : null}

      {timetableView === 'list' && col ? (
        <Segmented
          options={days.map((d) => ({ key: d, label: DAY_LABEL[d] }))}
          value={selDay}
          onChange={(d) => {
            selDayAutoRef.current = false
            setSelDay(d)
          }}
        />
      ) : null}

      {col && showTodayPill ? (
        <View style={styles.todayPillRow}>
          <Pressable
            onPress={returnToToday}
            style={({ pressed }) => [
              styles.todayPill,
              { backgroundColor: ui.pillBg, borderColor: ui.colors.chipBorder },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="today-outline" size={14} color={ui.pillText} />
            <Text style={[styles.todayPillText, { color: ui.pillText }]}>今日（{DAY_LABEL[todayKey]}）へ</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.swipeArea} {...swipePan.panHandlers}>
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]} refreshControl={refresh}>
        <HealthBanner health={health?.health} source="class" />
        <FreshnessLabel at={refreshedAt} />
        {syncNotice ? (
          <Text style={[styles.syncNotice, { color: ui.labelColor }]}>{syncNotice}</Text>
        ) : null}
        {!col ? (
          <View style={[ui.card, { marginTop: 16 }]}>
            <Text style={{ color: ui.valueColor }}>
              {syncing ? '時間割を取り込んでいます…' : 'まだ収集していません。下に引っ張って更新できます。'}
            </Text>
          </View>
        ) : timetableView === 'grid' ? (
          <View style={[ui.card, styles.gridCard]}>
            <View style={styles.gridRow}>
              <View style={styles.gridPerCol} />
              {days.map((d) => (
                <View
                  key={d}
                  style={[styles.gridDayHead, { backgroundColor: d === todayKey ? cellTodayBg : 'transparent' }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: d === todayKey ? '700' : '400', color: d === todayKey ? cellTextColor : ui.labelColor }}>
                    {DAY_LABEL[d]}
                  </Text>
                </View>
              ))}
            </View>
            {periods.map((p) => (
              <View key={p} style={styles.gridRow}>
                <View style={styles.gridPerCol}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: ui.valueColor }}>{p}</Text>
                </View>
                {days.map((d) => {
                  const slot = slotAt(d, p)
                  const cl = slot?.classes[0]
                  const pev = personalEventAt(personalEvents, d as PersonalDayKey, p)
                  const today = d === todayKey
                  const isNow = today && !!cl && p === curPeriod
                  const gev = cl ? pickCellEvent(events, cl.name, p, now) : null
                  const gCanceled = gev?.type === 'cancel'
                  // 隔週で今週は休みの授業は薄く（取消線）表示する。
                  const gOff = !!cl && !isClassOnDate(patterns[cl.courseCode], now)
                  return (
                    <Pressable
                      key={d}
                      disabled={false}
                      onPress={() => {
                        if (cl) return openSubject(cl, d as DayOfWeek, p)
                        if (pev) return navigation.navigate('PersonalEventForm', { editId: pev.id })
                        return navigation.navigate('PersonalEventForm', { day: d as PersonalDayKey, period: p })
                      }}
                      style={[
                        styles.gridCell,
                        { backgroundColor: isNow ? cellNowBg : cl ? (today ? cellTodayBg : cellFilledBg) : cellBg },
                        isNow ? styles.gridCellNow : today && cl ? styles.gridCellToday : null,
                        gCanceled ? styles.canceledCard : null,
                        gOff ? styles.offCell : null,
                        !cl && pev ? [styles.personalCell, { backgroundColor: ui.colors.gridCellPersonalBg }] : null,
                      ]}
                    >
                      {cl ? (
                        <>
                          <Text numberOfLines={3} style={[styles.gridCellText, { color: cellTextColor }, (gCanceled || gOff) && styles.canceledName]}>
                            {cl.name}
                          </Text>
                          {updatedCodes.has(cl.courseCode) ? <View style={[styles.gridDot, { backgroundColor: ui.colors.updateDot }]} /> : null}
                          {cl && dangerCodes.has(cl.courseCode) ? <View style={styles.gridDanger} /> : null}
                          {unreadCodes.has(cl.courseCode) ? <View style={styles.gridUnreadDot} /> : null}
                          {gev ? <View style={[styles.gridEvDot, { backgroundColor: ui.colors.info }]} /> : null}
                          {isNow ? (
                            <View style={styles.nowDot}>
                              <NowPulse size={7} />
                            </View>
                          ) : null}
                          {pev ? <View style={styles.personalDot} /> : null}
                        </>
                      ) : pev ? (
                        <Text numberOfLines={3} style={[styles.gridCellText, styles.personalCellText, ui.dark && { color: COLORS.emeraldLight }]}>{pev.title}</Text>
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            ))}
            <Text style={[styles.gridHint, { color: ui.labelColor }]}>タップで科目詳細 ・ ●は更新あり</Text>
          </View>
        ) : (
          <Animated.View style={{ opacity: swipeOpacity, transform: [{ translateX: swipeShift }] }}>
          {daySlots.length === 0 ? (
          <Text style={{ color: ui.labelColor, marginLeft: 2, marginTop: 10 }}>この曜日の授業はありません</Text>
        ) : (
          daySlots.map((s) => {
            const rowNow = selDay === todayKey && s.period === curPeriod
            return (
            <View key={`${s.day}-${s.period}`} style={styles.trow}>
              <View style={styles.per}>
                <Text style={[styles.pnum, { color: rowNow ? ui.pick(COLORS.white, COLORS.cta, COLORS.emeraldLight) : ui.heading }]}>{s.period}</Text>
                <Text style={[styles.ptime, { color: rowNow ? ui.pick(COLORS.white, COLORS.cta, COLORS.emeraldLight) : ui.labelColor }]}>{startTime(s.period)}</Text>
              </View>
              <View style={styles.clsCol}>
                {s.classes.map((cl) => {
                  const ev = pickCellEvent(events, cl.name, s.period, now)
                  const canceled = ev?.type === 'cancel'
                  const off = !isClassOnDate(patterns[cl.courseCode], now)
                  return (
                  <Pressable key={cl.courseCode || cl.name} style={[ui.card, rowNow && styles.nowCard, canceled && styles.canceledCard, off && styles.offCell]} onPress={() => openSubject(cl, s.day, s.period)}>
                    <View style={styles.clsHeadRow}>
                      <Text style={[styles.clsname, { color: ui.valueColor, flex: 1 }, (canceled || off) && styles.canceledName]} numberOfLines={2}>
                        {cl.name}
                        {updatedCodes.has(cl.courseCode) ? '  ●' : ''}
                        {unreadCodes.has(cl.courseCode) ? '  ◍' : ''}
                      </Text>
                      {rowNow ? (
                        <Badge variant="live" label="実施中" size="sm" />
                      ) : off ? (
                        <View style={[styles.offChip, { backgroundColor: ui.softBoxBg }]}>
                          <Text style={[styles.offChipText, { color: ui.subMuted }]}>今週休み・隔週</Text>
                        </View>
                      ) : null}
                    </View>
                    {ev ? (
                      <View style={[styles.evBadge, { backgroundColor: ui.colors.infoBg }]}>
                        <Text style={[styles.evBadgeText, { color: ui.colors.info }]} numberOfLines={1}>
                          {cellBadgeText(ev)}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={[styles.clssub, { color: ui.labelColor }]} numberOfLines={1}>
                      {cl.room}
                      {cl.isRemote ? ' ・ 遠隔' : ''}
                      {cl.teachers[0] ? ` ・ ${cl.teachers[0]}` : ''}
                    </Text>
                  </Pressable>
                  )
                })}
              </View>
            </View>
            )
          })
        )}

          {personalEventsOfDay(personalEvents, selDay as PersonalDayKey).map((pe) => (
              <Pressable
                key={pe.id}
                style={[ui.card, styles.personalRow]}
                onPress={() => navigation.navigate('PersonalEventForm', { editId: pe.id })}
              >
                <Text style={[styles.pnum, { color: ui.heading }]}>{pe.periods.map((p) => `${p}限`).join('・')}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: ui.valueColor }}>{pe.title}</Text>
                  {pe.note || pe.place ? (
                    <Text style={{ fontSize: 12, color: ui.labelColor }}>{[pe.note, pe.place].filter(Boolean).join(' ・ ')}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}

          {dayMakeups.length > 0 ? (
          <View style={{ marginTop: 6 }}>
            {dayMakeups.map((m, i) => (
              <View key={`mk-${i}`} style={styles.trow}>
                <View style={styles.per}>
                  <Text style={[styles.pnum, { color: ui.pick(COLORS.white, COLORS.cta, COLORS.emeraldLight) }]}>補</Text>
                  <Text style={[styles.ptime, { color: ui.labelColor }]}>{shortDate(m.date)}</Text>
                </View>
                <View style={styles.clsCol}>
                  <View style={[ui.card, styles.makeupCard]}>
                    <Text style={[styles.clsname, { color: ui.valueColor }]} numberOfLines={2}>
                      {m.courseName}　補講
                    </Text>
                    <Text style={[styles.clssub, { color: ui.labelColor }]} numberOfLines={1}>
                      {m.periods.join('・')}限{m.room ? ` ・ ${m.room}` : ''}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
          ) : null}
          </Animated.View>
        )}
      </ScrollView>
      </View>

      {syncing ? (
        <TimetableSyncEngine
          onFinished={() => {
            syncingRef.current = false
            setSyncing(false)
            loadTimetable().then(setCollections).catch(() => undefined)
            loadCollectionHealth().then((m) => setHealth(m.timetable ?? null)).catch(() => undefined)
            setAttendanceSyncing(true)
          }}
        />
      ) : null}
      {attendanceSyncing ? (
        <AttendanceStatsSyncEngine
          onFinished={() => {
            setAttendanceSyncing(false)
            reloadAttendance()
          }}
        />
      ) : null}
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  swipeArea: { flex: 1 },
  list: { paddingTop: 12, paddingBottom: 12 },
  syncNotice: { fontSize: 11, marginBottom: 8, marginLeft: 2 },
  trow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  per: { width: 44, alignItems: 'center', paddingTop: 8 },
  pnum: { fontSize: 17, fontWeight: '600' },
  ptime: { fontSize: 11, marginTop: 2 },
  clsCol: { flex: 1, gap: 8 },
  clsname: { fontSize: 14, fontWeight: '500' },
  clssub: { fontSize: 12, marginTop: 3 },
  canceledCard: { opacity: 0.6 },
  canceledName: { textDecorationLine: 'line-through' },
  evBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  evBadgeText: { fontSize: 11, fontWeight: '700' },
  makeupCard: { borderLeftWidth: 3, borderLeftColor: COLORS.cta },
  gridCard: { padding: 8 },
  gridRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  gridPerCol: { width: 22, alignItems: 'center', justifyContent: 'center' },
  gridDayHead: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: 8 },
  gridCell: { flex: 1, minHeight: 74, borderRadius: 11, padding: 6, justifyContent: 'center' },
  gridCellToday: { borderWidth: 1.5, borderColor: COLORS.emerald },
  gridCellNow: { borderWidth: 2.5, borderColor: COLORS.cta },
  nowDot: { position: 'absolute', top: 6, left: 6 },
  nowCard: { borderWidth: 2, borderColor: COLORS.cta },
  clsHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offCell: { opacity: 0.45 },
  offChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  offChipText: { fontSize: 10, fontWeight: '700' },
  gridCellText: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  gridDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4 },
  gridDanger: { position: 'absolute', top: 3, left: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.danger },
  gridUnreadDot: { position: 'absolute', bottom: 6, left: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.emerald },
  gridEvDot: { position: 'absolute', bottom: 6, right: 6, width: 7, height: 7, borderRadius: 4 },
  gridHint: { fontSize: 11, textAlign: 'center', marginTop: 6 },
  personalCell: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.emerald },
  personalCellText: { color: COLORS.emeraldDark, fontStyle: 'italic' },
  personalDot: { position: 'absolute', bottom: 3, left: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.emerald },
  personalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  todayPillRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  todayPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  todayPillText: { fontSize: 12, fontWeight: '700' },
})
