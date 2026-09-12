import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import DateTimeSheet from '../ui/DateTimeSheet'
import { Text, TextInput } from '../ui/Text'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS, DARK } from '../theme'
import type { TimetableStackParamList } from '../navigation/types'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { classBlockPeriods, nextDateForWeekday } from '../timetableEvents/classBlock'
import { dateToYmd, isValidYmd, ymdToDate } from '../timetableEvents/eventDateValue'
import { type ClassEventType, type MakeupStatus } from '../timetableEvents/classEvent'
import {
  buildClassEventFromForm,
  COUNTDOWN_CHOICES,
  countdownChoiceLabel,
  countdownFormFromEvent,
  countdownPickerValue,
  dateToHm,
  EMPTY_COUNTDOWN_FORM,
  isExamType,
  validateCountdownForm,
  type CountdownFormValue,
} from '../timetableEvents/classEventForm'
import { useDisplaySettings } from '../displaySettings'
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
  const [picker, setPicker] = useState<null | 'date' | 'mkDate' | 'startDate' | 'startTime'>(null)
  // 試験の表示開始（ホームのカウントダウンに出し始める時期）。既定は「全体の設定に従う」＝フィールドを付けない。
  const [countdown, setCountdown] = useState<CountdownFormValue>(EMPTY_COUNTDOWN_FORM)
  // 「全体の設定に従う（いま：○○）」の表示にだけ使う（判定には使わない）。
  const { examCountdownStart } = useDisplaySettings()

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
      // 🔴 戻さないと、メモだけ直して保存した時に表示開始が上書きで消える（設計 A 禁止事項3）。
      setCountdown(countdownFormFromEvent(e))
    })
  }, [editId])

  function onPicked(d: Date) {
    const which = picker
    // Androidはダイアログを閉じるたびにonChangeが来る。先に閉じてから反映（再表示ループ防止）。
    setPicker(null)
    if (!which) return
    // 状態ごとに明示で分ける。まとめて補講日へ流す書き方だと、足した状態の値が補講日の欄へ入る（設計 A §4-4）。
    // 日付を確定しても時刻シートは自動で開かない（iOS の Modal が閉じ切る前に開くと出ないことがある＝設計 A §6 Q10）。
    switch (which) {
      case 'date':
        setDate(dateToYmd(d))
        return
      case 'mkDate':
        setMkDate(dateToYmd(d))
        return
      case 'startDate':
        setCountdown((v) => ({ ...v, date: dateToYmd(d) }))
        return
      case 'startTime':
        setCountdown((v) => ({ ...v, time: dateToHm(d) }))
        return
      default: {
        // 状態を足して case を書き忘れると、ここで型エラーになる。
        const unreachable: never = which
        void unreachable
      }
    }
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
    // 表示開始の検査。種類が試験以外なら何もしない（フィールドも付かない）。
    const countdownError = validateCountdownForm(type, date, countdown)
    if (countdownError) {
      setError(countdownError)
      return
    }
    // 組み立ては classEventForm.ts（純関数・vitest で固定）。ここへ戻さない（ラチェット R3）。
    const ev = buildClassEventFromForm(
      { editId, courseName, courseCode, type, date, periods, room, note, makeupStatus, mkDate, mkPeriods, mkRoom, countdown },
      new Date(),
    )
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
      {/* automaticallyAdjustKeyboardInsets は iOS のみ有効。iOS は キーボードで window が
          縮まないため、これが無いと入力欄より下の保存ボタンがスクロールしても出てこない。 */}
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: clearance }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
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
          <DateTimeSheet
            open={picker === 'date'}
            value={ymdToDate(date, new Date())}
            mode="date"
            title={type === 'makeup' ? '補講日' : '日付'}
            onConfirm={onPicked}
            onCancel={() => setPicker(null)}
          />
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
                <DateTimeSheet
                  open={picker === 'mkDate'}
                  value={ymdToDate(mkDate, new Date())}
                  mode="date"
                  title="補講日"
                  onConfirm={onPicked}
                  onCancel={() => setPicker(null)}
                />
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

        {isExamType(type) ? (
          <View style={[ui.card, styles.card]}>
            {label('ホームのカウントダウンに出す時期')}
            <View style={styles.chipRow}>
              {COUNTDOWN_CHOICES.map((c) => {
                const on = countdown.choice === c
                return (
                  <Pressable
                    key={String(c)}
                    onPress={() => setCountdown((v) => ({ ...v, choice: c }))}
                    style={[styles.tchip, { borderColor: ui.colors.segBorder }, !on && darkChip, on && styles.tchipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.tchipText, !on && darkChipText, on && styles.tchipTextOn]}>
                      {countdownChoiceLabel(c, examCountdownStart)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            {countdown.choice === 'at' ? (
              <View style={styles.dtRow}>
                <DateField
                  value={countdown.date}
                  placeholder="日付を選択"
                  onPress={() => setPicker('startDate')}
                  valueColor={ui.valueColor}
                  placeholderColor={phColor}
                  boxStyle={[inputStyle, styles.dtDate]}
                  a11yLabel="表示を始める日付を選択"
                />
                <DateField
                  value={countdown.time}
                  placeholder="00:00"
                  onPress={() => setPicker('startTime')}
                  valueColor={ui.valueColor}
                  placeholderColor={phColor}
                  boxStyle={[inputStyle, styles.dtTime]}
                  a11yLabel="表示を始める時刻を選択"
                />
              </View>
            ) : null}
            <DateTimeSheet
              open={picker === 'startDate'}
              value={countdownPickerValue(countdown, new Date())}
              mode="date"
              title="表示を始める日"
              onConfirm={onPicked}
              onCancel={() => setPicker(null)}
            />
            <DateTimeSheet
              open={picker === 'startTime'}
              value={countdownPickerValue(countdown, new Date())}
              mode="time"
              is24Hour
              title="表示を始める時刻"
              onConfirm={onPicked}
              onCancel={() => setPicker(null)}
            />
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
  // 表示開始の「日時を指定」。日付欄と時刻欄を横に並べる（DeadlineFields と同じ 2:1）。
  dtRow: { flexDirection: 'row', gap: 8 },
  dtDate: { flex: 2 },
  dtTime: { flex: 1 },
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
