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
import TimetableSyncEngine from '../collect/TimetableSyncEngine'
import { currentPeriodNumber } from '../attendance/classPeriod'
import { Chip, ScreenBg, ScreenHeader, Segmented, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS } from '../theme'
import { useDisplaySettings } from '../displaySettings'

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
  // 多重起動防止（非同期スロットル判定中の再入も弾く）。setSyncing更新関数の中で副作用を起こさない。
  const syncingRef = useRef(false)

  // 時間割の裏取得を開始する。force=false ならスロットル（前回更新から時間が経っている時だけ）。
  const startSync = useCallback((force: boolean) => {
    if (syncingRef.current) return // 実行中/開始判定中は多重起動しない
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
                  return (
                    <Pressable
                      key={d}
                      disabled={!cl}
                      onPress={() => cl && openSubject(cl, d, p)}
                      style={[
                        styles.gridCell,
                        { backgroundColor: isNow ? cellNowBg : cl ? (today ? cellTodayBg : cellFilledBg) : cellBg },
                        isNow ? styles.gridCellNow : today && cl ? styles.gridCellToday : null,
                      ]}
                    >
                      {cl ? (
                        <>
                          <Text numberOfLines={3} style={[styles.gridCellText, { color: cellTextColor }]}>
                            {cl.name}
                          </Text>
                          {updatedCodes.has(cl.courseCode) ? <View style={styles.gridDot} /> : null}
                          {isNow ? (
                            <View style={styles.nowBadge}>
                              <Text style={styles.nowBadgeText}>今</Text>
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
                {s.classes.map((cl) => (
                  <Pressable key={cl.courseCode || cl.name} style={[ui.card, rowNow && styles.nowCard]} onPress={() => openSubject(cl, s.day as DayKey, s.period)}>
                    <Text style={[styles.clsname, { color: ui.valueColor }]} numberOfLines={2}>
                      {cl.name}
                      {rowNow ? '　（今）' : ''}
                      {updatedCodes.has(cl.courseCode) ? '  ●' : ''}
                    </Text>
                    <Text style={[styles.clssub, { color: ui.labelColor }]} numberOfLines={1}>
                      {cl.room}
                      {cl.isRemote ? ' ・ 遠隔' : ''}
                      {cl.teachers[0] ? ` ・ ${cl.teachers[0]}` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            )
          })
        )}
      </ScrollView>

      {syncing ? (
        <TimetableSyncEngine
          onFinished={() => {
            syncingRef.current = false
            setSyncing(false)
            loadTimetable().then(setCollections).catch(() => undefined)
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
  gridCard: { padding: 8 },
  gridRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  gridPerCol: { width: 22, alignItems: 'center', justifyContent: 'center' },
  gridDayHead: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: 8 },
  gridCell: { flex: 1, minHeight: 74, borderRadius: 11, padding: 6, justifyContent: 'center' },
  gridCellToday: { borderWidth: 1.5, borderColor: COLORS.emerald },
  gridCellNow: { borderWidth: 2.5, borderColor: COLORS.cta },
  nowBadge: { position: 'absolute', top: 5, left: 5, backgroundColor: COLORS.cta, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  nowBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '700' },
  nowCard: { borderWidth: 2, borderColor: COLORS.cta },
  gridCellText: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  gridDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: '#e8a400' },
  gridHint: { fontSize: 11, textAlign: 'center', marginTop: 6 },
})
