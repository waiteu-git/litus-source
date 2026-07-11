import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadTimetable } from '../storage/timetableStore'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { TimetableStackParamList } from '../navigation/types'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'
import { isTimetableStale, loadTimetableRefreshedAt } from '../storage/refreshMetaStore'
import { loadCollectionHealth } from '../storage/collectionHealthStore'
import type { StoredHealth } from '../storage/collectionHealthSerialize'
import HealthBanner from '../ui/HealthBanner'
import { maintenanceSystemAt } from '../health/maintenanceWindow'
import TimetableSyncEngine from '../collect/TimetableSyncEngine'
import { currentPeriodNumber } from '../attendance/classPeriod'
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

const WEEKDAY_KEY: Record<number, DayKey | undefined> = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = (typeof DAY_ORDER)[number]
const DAY_LABEL: Record<DayKey, string> = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土' }
const TODAY_KEYS: DayKey[] = ['mon', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

type ClassEntry = TimetableCollection['slots'][number]['classes'][number]

export default function TimetableScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { timetableView } = useDisplaySettings()
  const [collections, setCollections] = useState<TimetableCollection[] | null>(null)
  const [updatedCodes, setUpdatedCodes] = useState<Set<string>>(new Set())
  const [events, setEvents] = useState<ClassEvent[]>([])
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
  // 時間割の裏取得中フラグ。true の間だけ headless エンジンをマウントして収集する。
  const [syncing, setSyncing] = useState(false)
  // 時間割収集の最終ヘルス（層1の正直表示バナー用）。
  const [health, setHealth] = useState<StoredHealth | null>(null)
  // 多重起動防止（非同期スロットル判定中の再入も弾く）。setSyncing更新関数の中で副作用を起こさない。
  const syncingRef = useRef(false)

  // 時間割の裏取得を開始する。force=false ならスロットル（前回更新から時間が経っている時だけ）。
  const startSync = useCallback((force: boolean) => {
    if (syncingRef.current) return // 実行中/開始判定中は多重起動しない
    // CLASS定時メンテナンス帯（2:00–4:00）は収集不能。ヘルスバナーがメンテ表示を出すので無駄打ちを止める。
    if (maintenanceSystemAt(new Date()) === 'class') return
    const begin = () => {
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
  }, [])

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
      loadWeeklyPatterns().then((m) => { if (active) setPatterns(m) }).catch(() => undefined)
      loadCollectionHealth().then((m) => { if (active) setHealth(m.timetable ?? null) }).catch(() => undefined)
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
  const days = DAY_ORDER.filter((d) => d !== 'sat' || hasSat)
  const daySlots = col ? col.slots.filter((s) => s.day === selDay).sort((a, b) => a.period - b.period) : []
  // 選択曜日に落ちる補講オカレンス（休講内包＋単独）。時間割の通常コマとは別に一回限りで表示。
  const dayMakeups = upcomingMakeups(events, now).filter((m) => WEEKDAY_KEY[new Date(m.date).getDay()] === selDay)
  const startTime = (period: number) => col?.periodTimes?.periods.find((p) => p.period === period)?.start ?? ''

  // グリッド表示用: 授業がある最大時限まで（最低6限は確保）。
  const periods = useMemo(() => {
    if (!col) return []
    let max = 6
    for (const s of col.slots) if (s.period > max) max = s.period
    return Array.from({ length: max }, (_, i) => i + 1)
  }, [col])

  function slotAt(day: DayKey, period: number) {
    return col?.slots.find((s) => s.day === day && s.period === period) ?? null
  }

  function openSubject(cl: ClassEntry, day: DayKey, period: number) {
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

  const cellBg = ui.green ? 'rgba(255,255,255,0.16)' : '#f3f7f5'
  const cellFilledBg = ui.green ? 'rgba(255,255,255,0.5)' : '#e8f4ee'
  const cellTodayBg = ui.green ? 'rgba(255,255,255,0.62)' : '#d6efe4'
  const cellNowBg = ui.green ? 'rgba(255,255,255,0.88)' : '#c3ead7'
  const cellTextColor = ui.green ? '#04322a' : ui.valueColor

  return (
    <ScreenBg>
      <ScreenHeader
        title="時間割"
        icon="calendar-outline"
        right={
          syncing ? (
            <Chip label="更新中…" />
          ) : (
            <Chip label="コース" icon="book-outline" onPress={() => navigation.navigate('LetusCourses')} />
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
        <Segmented options={days.map((d) => ({ key: d, label: DAY_LABEL[d] }))} value={selDay} onChange={setSelDay} />
      ) : null}

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]} refreshControl={refresh}>
        <HealthBanner health={health?.health} source="class" />
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
                  const today = d === todayKey
                  const isNow = today && !!cl && p === curPeriod
                  const gev = cl ? pickCellEvent(events, cl.name, p, now) : null
                  const gCanceled = gev?.type === 'cancel'
                  // 隔週で今週は休みの授業は薄く（取消線）表示する。
                  const gOff = !!cl && !isClassOnDate(patterns[cl.courseCode], now)
                  return (
                    <Pressable
                      key={d}
                      disabled={!cl}
                      onPress={() => cl && openSubject(cl, d, p)}
                      style={[
                        styles.gridCell,
                        { backgroundColor: isNow ? cellNowBg : cl ? (today ? cellTodayBg : cellFilledBg) : cellBg },
                        isNow ? styles.gridCellNow : today && cl ? styles.gridCellToday : null,
                        gCanceled ? styles.canceledCard : null,
                        gOff ? styles.offCell : null,
                      ]}
                    >
                      {cl ? (
                        <>
                          <Text numberOfLines={3} style={[styles.gridCellText, { color: cellTextColor }, (gCanceled || gOff) && styles.canceledName]}>
                            {cl.name}
                          </Text>
                          {updatedCodes.has(cl.courseCode) ? <View style={styles.gridDot} /> : null}
                          {gev ? <View style={[styles.gridEvDot, gCanceled ? styles.gridEvDotCancel : styles.gridEvDotInfo]} /> : null}
                          {isNow ? (
                            <View style={styles.nowDot}>
                              <NowPulse size={7} />
                            </View>
                          ) : null}
                        </>
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            ))}
            <Text style={[styles.gridHint, { color: ui.labelColor }]}>タップで科目詳細 ・ ●は更新あり</Text>
          </View>
        ) : daySlots.length === 0 ? (
          <Text style={{ color: ui.labelColor, marginLeft: 2, marginTop: 10 }}>この曜日の授業はありません</Text>
        ) : (
          daySlots.map((s) => {
            const rowNow = selDay === todayKey && s.period === curPeriod
            return (
            <View key={`${s.day}-${s.period}`} style={styles.trow}>
              <View style={styles.per}>
                <Text style={[styles.pnum, { color: rowNow ? COLORS.cta : ui.green ? COLORS.white : COLORS.emeraldDark }]}>{s.period}</Text>
                <Text style={[styles.ptime, { color: rowNow ? COLORS.cta : ui.labelColor }]}>{startTime(s.period)}</Text>
              </View>
              <View style={styles.clsCol}>
                {s.classes.map((cl) => {
                  const ev = pickCellEvent(events, cl.name, s.period, now)
                  const canceled = ev?.type === 'cancel'
                  const off = !isClassOnDate(patterns[cl.courseCode], now)
                  return (
                  <Pressable key={cl.courseCode || cl.name} style={[ui.card, rowNow && styles.nowCard, canceled && styles.canceledCard, off && styles.offCell]} onPress={() => openSubject(cl, s.day as DayKey, s.period)}>
                    <View style={styles.clsHeadRow}>
                      <Text style={[styles.clsname, { color: ui.valueColor, flex: 1 }, (canceled || off) && styles.canceledName]} numberOfLines={2}>
                        {cl.name}
                        {updatedCodes.has(cl.courseCode) ? '  ●' : ''}
                      </Text>
                      {rowNow ? (
                        <View style={styles.nowChip}>
                          <NowPulse size={6} color="#ffffff" />
                          <Text style={styles.nowChipText}>実施中</Text>
                        </View>
                      ) : off ? (
                        <View style={styles.offChip}>
                          <Text style={styles.offChipText}>今週休み・隔週</Text>
                        </View>
                      ) : null}
                    </View>
                    {ev ? (
                      <View style={[styles.evBadge, canceled ? styles.evBadgeCancel : styles.evBadgeInfo]}>
                        <Text style={[styles.evBadgeText, canceled ? styles.evBadgeTextCancel : styles.evBadgeTextInfo]} numberOfLines={1}>
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

        {timetableView === 'list' && col && dayMakeups.length > 0 ? (
          <View style={{ marginTop: 6 }}>
            {dayMakeups.map((m, i) => (
              <View key={`mk-${i}`} style={styles.trow}>
                <View style={styles.per}>
                  <Text style={[styles.pnum, { color: COLORS.cta }]}>補</Text>
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
      </ScrollView>

      {syncing ? (
        <TimetableSyncEngine
          onFinished={() => {
            syncingRef.current = false
            setSyncing(false)
            loadTimetable().then(setCollections).catch(() => undefined)
            loadCollectionHealth().then((m) => setHealth(m.timetable ?? null)).catch(() => undefined)
          }}
        />
      ) : null}
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: 12, paddingBottom: 12 },
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
  evBadgeCancel: { backgroundColor: '#ffe1d8' },
  evBadgeInfo: { backgroundColor: '#e3f0ff' },
  evBadgeText: { fontSize: 11, fontWeight: '700' },
  evBadgeTextCancel: { color: '#b23b1c' },
  evBadgeTextInfo: { color: '#1c5fb2' },
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
  offChip: { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  offChipText: { fontSize: 10, fontWeight: '700', color: '#7a8a83' },
  nowChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.cta, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  nowChipText: { color: '#ffffff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  gridCellText: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  gridDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: '#e8a400' },
  gridEvDot: { position: 'absolute', bottom: 6, right: 6, width: 7, height: 7, borderRadius: 4 },
  gridEvDotCancel: { backgroundColor: '#e0533a' },
  gridEvDotInfo: { backgroundColor: '#3a7be0' },
  gridHint: { fontSize: 11, textAlign: 'center', marginTop: 6 },
})
