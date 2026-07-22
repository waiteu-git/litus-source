import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Text, TextInput } from '../ui/Text'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS, DARK } from '../theme'
import type { TimetableStackParamList } from '../navigation/types'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { classBlockPeriods, nextDateForWeekday } from '../timetableEvents/classBlock'
import { dateToYmd, isValidYmd, ymdToDate } from '../timetableEvents/eventDateValue'
import { makeClassEventId, type ClassEvent, type ClassEventType, type MakeupStatus } from '../timetableEvents/classEvent'
import { eventTypeLabel } from '../timetableEvents/eventLabels'
import { loadClassEvents, upsertClassEvent, removeClassEvent } from '../storage/classEventsStore'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import { refreshAllNotifications } from '../notifications/notificationRefresh'

type Nav = NativeStackNavigationProp<TimetableStackParamList>
type Rt = RouteProp<TimetableStackParamList, 'ClassEventForm'>

const TYPES: ClassEventType[] = ['cancel', 'roomChange', 'quiz', 'midterm', 'final', 'makeup', 'other']
const PERIOD_CANDIDATES = [1, 2, 3, 4, 5, 6]

function toggle(arr: number[], p: number): number[] {
  return (arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]).sort((a, b) => a - b)
}

/** 日付欄。TextInput ではなくネイティブ日付ピッカーを開くボタンとして振る舞う。 */
function DateField({ value, placeholder, onPress, valueColor, placeholderColor, boxStyle, a11yLabel }: {
  value: string
  placeholder: string
  onPress: () => void
  valueColor: string
  placeholderColor: string
  boxStyle: StyleProp<ViewStyle>
  a11yLabel: string
}) {
  return (
    <Pressable
      style={[styles.dateField, boxStyle]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <Text style={[styles.dateFieldText, { color: value ? valueColor : placeholderColor }]}>
        {value || placeholder}
      </Text>
    </Pressable>
  )
}

export default function ClassEventFormScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<Rt>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { timetable } = useAttendanceEngine()
  const { bump } = useClassEventsVersion()
  const { courseName, courseCode, dayKey, editId, initialType, initialDate, initialPeriods, initialRoom, initialMakeup } = route.params

  const block = useMemo(() => {
    if (!dayKey) return [] as number[]
    for (const c of timetable) {
      const b = classBlockPeriods(c, dayKey, courseName)
      if (b.length) return b
    }
    return [] as number[]
  }, [timetable, dayKey, courseName])

  const [type, setType] = useState<ClassEventType>(initialType ?? 'cancel')
  const [date, setDate] = useState<string>(() => initialDate ?? (dayKey ? nextDateForWeekday(dayKey, new Date()) : ''))
  const [periods, setPeriods] = useState<number[]>(initialPeriods && initialPeriods.length ? initialPeriods : block.length ? block : [1])
  const [room, setRoom] = useState(initialRoom ?? '')
  const [note, setNote] = useState('')
  const [makeupStatus, setMakeupStatus] = useState<MakeupStatus>(initialMakeup ? 'has' : 'undecided')
  const [mkDate, setMkDate] = useState(initialMakeup?.date ?? '')
  const [mkPeriods, setMkPeriods] = useState<number[]>(initialMakeup?.periods ?? [])
  const [mkRoom, setMkRoom] = useState(initialMakeup?.room ?? '')
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<null | 'date' | 'mkDate'>(null)

  useEffect(() => {
    if (!editId) return
    loadClassEvents().then((list) => {
      const e = list.find((x) => x.id === editId)
      if (!e) return
      setType(e.type)
      setDate(e.date)
      setPeriods(e.periods.length ? e.periods : [1])
      setRoom(e.room ?? '')
      setNote(e.note ?? '')
      setMakeupStatus(e.makeupStatus ?? 'undecided')
      setMkDate(e.makeup?.date ?? '')
      setMkPeriods(e.makeup?.periods ?? [])
      setMkRoom(e.makeup?.room ?? '')
    })
  }, [editId])

  function onPicked(event: DateTimePickerEvent, d: Date | undefined) {
    const which = picker
    // Androidはダイアログを閉じるたびにonChangeが来る。先に閉じてから反映（再表示ループ防止）。
    setPicker(null)
    if (event.type !== 'set' || !d || !which) return
    if (which === 'date') setDate(dateToYmd(d))
    else setMkDate(dateToYmd(d))
  }

  async function onSave() {
    if (!isValidYmd(date)) {
      setError('日付の形式を確認してください（例: 2026-07-15）')
      return
    }
    if (periods.length === 0) {
      setError('時限を1つ以上選んでください')
      return
    }
    if (type === 'cancel' && makeupStatus === 'has') {
      if (!isValidYmd(mkDate) || mkPeriods.length === 0) {
        setError('補講の日付と時限を入力してください')
        return
      }
    }
    const now = new Date()
    const id = editId ?? makeClassEventId({ createdAt: now.toISOString(), courseName, type, date })
    const ev: ClassEvent = {
      id,
      courseName,
      courseCode,
      type,
      date,
      periods,
      room: type === 'roomChange' || type === 'makeup' ? room.trim() || null : null,
      note: note.trim() || null,
      createdAt: now.toISOString(),
    }
    if (type === 'cancel') {
      ev.makeupStatus = makeupStatus
      ev.makeup = makeupStatus === 'has' ? { date: mkDate, periods: mkPeriods, room: mkRoom.trim() || null } : null
    }
    await upsertClassEvent(ev)
    bump()
    refreshAllNotifications().catch(() => undefined)
    nav.goBack()
  }

  function onDelete() {
    if (!editId) return
    Alert.alert('削除しますか？', 'この予定を削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await removeClassEvent(editId)
          bump()
          refreshAllNotifications().catch(() => undefined)
          nav.goBack()
        },
      },
    ])
  }

  const inputStyle = { backgroundColor: ui.inputBg, borderColor: ui.colors.inputBorder }
  const phColor = ui.subMuted
  const darkChip = ui.dark ? { backgroundColor: DARK.softBox, borderColor: DARK.inputBorder } : null
  const darkChipText = ui.dark ? { color: COLORS.emeraldLight } : null
  const label = (s: string) => <Text style={[styles.label, { color: ui.labelColor }]}>{s}</Text>
  const showRoom = type === 'roomChange' || type === 'makeup'

  const PeriodChips = ({ sel, onToggle }: { sel: number[]; onToggle: (p: number) => void }) => (
    <View style={styles.chipRow}>
      {PERIOD_CANDIDATES.map((p) => {
        const on = sel.includes(p)
        return (
          <Pressable
            key={p}
            onPress={() => onToggle(p)}
            style={[styles.pchip, { borderColor: ui.colors.segBorder }, !on && darkChip, on && styles.pchipOn]}
          >
            <Text style={[styles.pchipText, !on && darkChipText, on && styles.pchipTextOn]}>{p}限</Text>
          </Pressable>
        )
      })}
    </View>
  )

  return (
    <ScreenBg>
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]} keyboardShouldPersistTaps="handled">
        <View style={[ui.card, styles.card]}>
          <Text style={[styles.course, { color: ui.valueColor }]}>{courseName}</Text>
        </View>

        <View style={[ui.card, styles.card]}>
          {label('種類')}
          <View style={styles.chipRow}>
            {TYPES.map((t) => {
              const on = type === t
              return (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  style={[styles.tchip, { borderColor: ui.colors.segBorder }, !on && darkChip, on && styles.tchipOn]}
                >
                  <Text style={[styles.tchipText, !on && darkChipText, on && styles.tchipTextOn]}>{eventTypeLabel(t)}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={[ui.card, styles.card]}>
          {label(type === 'makeup' ? '補講日' : '日付')}
          <DateField
            value={date}
            placeholder="日付を選択"
            onPress={() => setPicker('date')}
            valueColor={ui.valueColor}
            placeholderColor={phColor}
            boxStyle={inputStyle}
            a11yLabel={type === 'makeup' ? '補講日を選択' : '日付を選択'}
          />
          {picker === 'date' ? (
            <DateTimePicker value={ymdToDate(date, new Date())} mode="date" onChange={onPicked} />
          ) : null}
        </View>

        <View style={[ui.card, styles.card]}>
          {label('対象の時限（複数選択可）')}
          <PeriodChips sel={periods} onToggle={(p) => setPeriods((v) => toggle(v, p))} />
          {block.length > 1 && type !== 'makeup' ? (
            <Text style={[styles.hint, { color: ui.labelColor }]}>連続{block.length}コマ。片方だけの休講等は外してください。</Text>
          ) : null}
        </View>

        {showRoom ? (
          <View style={[ui.card, styles.card]}>
            {label(type === 'roomChange' ? '変更後の教室' : '補講の教室')}
            <TextInput
              style={[styles.input, inputStyle, { color: ui.valueColor }]}
              value={room}
              onChangeText={setRoom}
              placeholder="例: K404"
              placeholderTextColor={phColor}
            />
          </View>
        ) : null}

        {type === 'cancel' ? (
          <View style={[ui.card, styles.card]}>
            {label('補講')}
            <View style={styles.chipRow}>
              {(['has', 'none', 'undecided'] as MakeupStatus[]).map((s) => {
                const on = makeupStatus === s
                const t = s === 'has' ? '補講あり' : s === 'none' ? '補講なし' : '未定'
                return (
                  <Pressable
                    key={s}
                    onPress={() => setMakeupStatus(s)}
                    style={[styles.tchip, { borderColor: ui.colors.segBorder }, !on && darkChip, on && styles.tchipOn]}
                  >
                    <Text style={[styles.tchipText, !on && darkChipText, on && styles.tchipTextOn]}>{t}</Text>
                  </Pressable>
                )
              })}
            </View>
            {makeupStatus === 'has' ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                {label('補講日')}
                <DateField
                  value={mkDate}
                  placeholder="日付を選択"
                  onPress={() => setPicker('mkDate')}
                  valueColor={ui.valueColor}
                  placeholderColor={phColor}
                  boxStyle={inputStyle}
                  a11yLabel="補講日を選択"
                />
                {picker === 'mkDate' ? (
                  <DateTimePicker value={ymdToDate(mkDate, new Date())} mode="date" onChange={onPicked} />
                ) : null}
                {label('補講の時限')}
                <PeriodChips sel={mkPeriods} onToggle={(p) => setMkPeriods((v) => toggle(v, p))} />
                {label('補講の教室（任意）')}
                <TextInput
                  style={[styles.input, inputStyle, { color: ui.valueColor }]}
                  value={mkRoom}
                  onChangeText={setMkRoom}
                  placeholder="例: K404"
                  placeholderTextColor={phColor}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[ui.card, styles.card]}>
          {label('メモ（任意）')}
          <TextInput
            style={[styles.input, inputStyle, { color: ui.valueColor }]}
            value={note}
            onChangeText={setNote}
            placeholder="任意"
            placeholderTextColor={phColor}
          />
        </View>

        {error ? <Text style={[styles.error, { color: ui.colors.danger }]}>{error}</Text> : null}

        <Pressable style={styles.saveBtn} onPress={onSave}>
          <Text style={styles.saveText}>{editId ? '保存' : '追加'}</Text>
        </Pressable>
        {editId ? (
          <Pressable
            style={[styles.deleteBtn, { borderColor: ui.colors.danger, backgroundColor: ui.colors.dangerBg }]}
            onPress={onDelete}
          >
            <Text style={[styles.deleteText, { color: ui.colors.danger }]}>削除</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: 8, paddingBottom: 40, gap: 12 },
  card: { gap: 8 },
  course: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  // 日付欄（Pressable）。TextInput の枠と同じ寸法にして行の高さを揃える。
  dateField: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, justifyContent: 'center' },
  dateFieldText: { fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tchip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.tint, borderWidth: 1 },
  tchipOn: { backgroundColor: COLORS.cta, borderColor: COLORS.cta },
  tchipText: { fontSize: 13, color: COLORS.emeraldDark, fontWeight: '600' },
  tchipTextOn: { color: COLORS.white },
  pchip: { width: 46, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.tint, borderWidth: 1, alignItems: 'center' },
  pchipOn: { backgroundColor: COLORS.cta, borderColor: COLORS.cta },
  pchipText: { fontSize: 13, color: COLORS.emeraldDark, fontWeight: '600' },
  pchipTextOn: { color: COLORS.white },
  hint: { fontSize: 12 },
  error: { fontSize: 13, marginHorizontal: 4 },
  saveBtn: { backgroundColor: COLORS.cta, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  deleteBtn: { borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  deleteText: { fontSize: 15, fontWeight: '600' },
})
