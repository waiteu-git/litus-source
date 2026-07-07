import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadTimetable } from '../storage/timetableStore'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { TimetableStackParamList } from '../navigation/types'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'
import { Chip, ScreenBg, ScreenHeader, Segmented, useUi } from '../ui/screen'
import { COLORS } from '../theme'

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = (typeof DAY_ORDER)[number]
const DAY_LABEL: Record<DayKey, string> = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土' }
const TODAY_KEYS: DayKey[] = ['mon', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export default function TimetableScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const ui = useUi()
  const [collections, setCollections] = useState<TimetableCollection[] | null>(null)
  const [updatedCodes, setUpdatedCodes] = useState<Set<string>>(new Set())
  const [selCol, setSelCol] = useState(0)
  const [selDay, setSelDay] = useState<DayKey>(TODAY_KEYS[new Date().getDay()])

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
      return () => {
        active = false
      }
    }, []),
  )

  const col = collections && collections.length > 0 ? collections[Math.min(selCol, collections.length - 1)] : null
  const hasSat = !!col?.slots.some((s) => s.day === 'sat')
  const days = DAY_ORDER.filter((d) => d !== 'sat' || hasSat)
  const daySlots = col ? col.slots.filter((s) => s.day === selDay).sort((a, b) => a.period - b.period) : []
  const startTime = (period: number) => col?.periodTimes?.periods.find((p) => p.period === period)?.start ?? ''

  return (
    <ScreenBg>
      <ScreenHeader
        title="時間割"
        icon="calendar-outline"
        right={
          <>
            <Chip label="更新" onPress={() => navigation.navigate('Collect')} />
            <Chip label="コース" onPress={() => navigation.navigate('CollectCourses')} />
            <Chip label="チェック" onPress={() => navigation.navigate('UpdateCheck')} />
          </>
        }
      />

      {!col ? (
        <View style={[ui.card, { marginTop: 16 }]}>
          <Text style={{ color: ui.valueColor }}>まだ収集していません。「更新」から収集してください。</Text>
        </View>
      ) : (
        <>
          {collections && collections.length > 1 ? (
            <Segmented
              options={collections.map((_, i) => ({ key: String(i), label: `時間割${i + 1}` }))}
              value={String(selCol)}
              onChange={(k) => setSelCol(Number(k))}
            />
          ) : null}
          <Segmented
            options={days.map((d) => ({ key: d, label: DAY_LABEL[d] }))}
            value={selDay}
            onChange={setSelDay}
          />
          <ScrollView contentContainerStyle={styles.list}>
            {daySlots.length === 0 ? (
              <Text style={{ color: ui.labelColor, marginLeft: 2, marginTop: 10 }}>この曜日の授業はありません</Text>
            ) : (
              daySlots.map((s) => (
                <View key={`${s.day}-${s.period}`} style={styles.trow}>
                  <View style={styles.per}>
                    <Text style={[styles.pnum, { color: ui.glass ? COLORS.white : COLORS.emeraldDark }]}>
                      {s.period}
                    </Text>
                    <Text style={[styles.ptime, { color: ui.labelColor }]}>{startTime(s.period)}</Text>
                  </View>
                  <View style={styles.clsCol}>
                    {s.classes.map((cl) => (
                      <Pressable
                        key={cl.courseCode || cl.name}
                        style={ui.card}
                        onPress={() =>
                          navigation.navigate('SubjectDetail', { courseCode: cl.courseCode, name: cl.name })
                        }
                      >
                        <Text style={[styles.clsname, { color: ui.valueColor }]} numberOfLines={2}>
                          {cl.name}
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
              ))
            )}
          </ScrollView>
        </>
      )}
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
})
