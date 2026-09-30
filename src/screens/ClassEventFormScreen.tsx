import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
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
import { pickableMakeups, type ClassEvent, type ClassEventType, type MakeupStatus } from '../timetableEvents/classEvent'
import {
  buildClassEventFromForm,
  COUNTDOWN_CHOICES,
  countdownChoiceLabel,
  countdownFormFromEvent,
  countdownPickerValue,
  dateToHm,
  EMPTY_COUNTDOWN_FORM,
  initialMakeupMode,
  isExamType,
  isMakeupPicked,
  makeupFormValues,
  makeupSelectionError,
  shouldFocusMakeupCard,
  validateCountdownForm,
  type CountdownFormValue,
  type MakeupMode,
} from '../timetableEvents/classEventForm'
import { useDisplaySettings } from '../displaySettings'
import { eventTypeLabel, makeupPickA11yLabel, makeupPickRowText } from '../timetableEvents/eventLabels'
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
  // 補講欄のモード（設計 2026-09-30）。'pick'＝追加済みの補講から選ぶ（日程は変更不可＝入力欄を出さない）、'manual'＝手入力。
  // 開いて読み込んだ時に initialMakeupMode で1回だけ決め、以後は切り替えのタップだけが変える（値から毎回導出しない＝入力中に入力欄が消えるため）。
  const [mkMode, setMkMode] = useState<MakeupMode>('manual')
  // 選べる補講の元になる、保存済みの全予定（科目では絞らない。絞りは pickableMakeups が sameCourse で行う）。
  const [events, setEvents] = useState<ClassEvent[]>([])
  // 読み込み完了まで補講の入力欄・候補を描かない（初回の1フレームだけ手入力欄が出てから候補リストに変わる、を防ぐ）。
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<null | 'date' | 'mkDate' | 'startDate' | 'startTime'>(null)
  // 試験の表示開始（ホームのカウントダウンに出し始める時期）。既定は「全体の設定に従う」＝フィールドを付けない。
  const [countdown, setCountdown] = useState<CountdownFormValue>(EMPTY_COUNTDOWN_FORM)
  // 「全体の設定に従う（いま：○○）」の表示にだけ使う（判定には使わない）。
  const { examCountdownStart } = useDisplaySettings()

  // 補講欄へ寄せる（初回だけ）。補講欄は初期表示の約500pt下にあり、寄せないと候補に気づけない。animated: false＝モーション規約に触れない。
  // 判定は読み込み完了の直後に1回だけ（種類や補講の状態をあとから触った時には発火させない）。
  const scrollRef = useRef<ScrollView>(null)
  const makeupCardY = useRef<number | null>(null)
  const focusPending = useRef(false)
  const focusMakeupCard = () => {
    if (makeupCardY.current == null) return false
    scrollRef.current?.scrollTo({ y: Math.max(0, makeupCardY.current - 8), animated: false })
    return true
  }

  useEffect(() => {
    loadClassEvents()
      .then((list) => {
        setEvents(list)
        const e = editId ? list.find((x) => x.id === editId) : undefined
        if (e) {
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
        }
        // モードは編集値（無ければ新規の初期値）と候補から、同じ .then で1回だけ決める（1回の描画に揃える）。
        const form: { makeupStatus: MakeupStatus; mkDate: string; mkPeriods: number[]; mkRoom: string } = e
          ? {
              makeupStatus: e.makeupStatus ?? 'undecided',
              mkDate: e.makeup?.date ?? '',
              mkPeriods: e.makeup?.periods ?? [],
              mkRoom: e.makeup?.room ?? '',
            }
          : {
              makeupStatus: initialMakeup ? 'has' : 'undecided',
              mkDate: initialMakeup?.date ?? '',
              mkPeriods: initialMakeup?.periods ?? [],
              mkRoom: initialMakeup?.room ?? '',
            }
        const cands = pickableMakeups(list, { courseName, courseCode, date: e ? e.date : date }, editId)
        setMkMode(initialMakeupMode(cands, form))
        if (e && shouldFocusMakeupCard({ editId, type: e.type, makeupStatus: form.makeupStatus, candidateCount: cands.length })) {
          // カードの位置が未計測なら、計測できた時（onLayout）に寄せる。
          if (!focusMakeupCard()) focusPending.current = true
        }
      })
      .catch(() => undefined) // 読めなければ手入力のまま（今までの編集画面と同じ）
      .then(() => setEventsLoaded(true))
  }, [editId])

  // 選べる補講（休講の値は保存時と同じルート引数の科目名・コード）。日付は休講日に近い順に並べるためだけに使う。
  const candidates = useMemo(
    () => pickableMakeups(events, { courseName, courseCode, date }, editId),
    [events, courseName, courseCode, date, editId],
  )

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
    // 候補から選ぶモードで未選択のまま保存させない（既存の「補講の日付と時限を入力してください」は手入力の文言なので先に止める）。
    const selectionError = type === 'cancel' ? makeupSelectionError(mkMode, { makeupStatus, mkDate, mkPeriods, mkRoom }, candidates) : null
    if (selectionError) {
      setError(selectionError)
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

  /** 追加済みの補講を選ぶ＝その補講の日付・時限・教室を補講欄へ写す（保存は「保存」ボタン）。選択中の行の再タップは何もしない。 */
  function pickMakeup(s: ClassEvent) {
    if (isMakeupPicked({ makeupStatus, mkDate, mkPeriods, mkRoom }, s)) return
    const v = makeupFormValues(s)
    setMakeupStatus(v.makeupStatus)
    setMkDate(v.mkDate)
    setMkPeriods(v.mkPeriods)
    setMkRoom(v.mkRoom)
    setError(null)
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
        ref={scrollRef}
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
          <View
            style={[ui.card, styles.card]}
            onLayout={(ev) => {
              makeupCardY.current = ev.nativeEvent.layout.y
              if (focusPending.current) {
                focusPending.current = false
                focusMakeupCard()
              }
            }}
          >
            {label('補講')}
            <View style={styles.chipRow}>
              {(['has', 'none', 'undecided'] as MakeupStatus[]).map((s) => {
                const on = makeupStatus === s
                const t = s === 'has' ? '補講あり' : s === 'none' ? '補講なし' : '未定'
                return (
                  <Pressable
                    key={s}
                    onPress={() => setMakeupStatus(s)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.tchip, { borderColor: ui.colors.segBorder }, !on && darkChip, on && styles.tchipOn]}
                  >
                    <Text style={[styles.tchipText, !on && darkChipText, on && styles.tchipTextOn]}>{t}</Text>
                  </Pressable>
                )
              })}
            </View>
            {eventsLoaded && candidates.length > 0 && makeupStatus !== 'has' ? (
              <Text style={[styles.hint, { color: ui.labelColor }]}>
                追加済みの補講が{candidates.length}件あります。「補講あり」を選ぶと、そこから選べます。
              </Text>
            ) : null}
            {eventsLoaded && makeupStatus === 'has' ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                {candidates.length > 0 ? (
                  <View style={styles.chipRow}>
                    {(['manual', 'pick'] as MakeupMode[]).map((m) => {
                      const on = mkMode === m
                      return (
                        <Pressable
                          key={m}
                          onPress={() => {
                            setMkMode(m)
                            setError(null)
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          style={[styles.tchip, { borderColor: ui.colors.segBorder }, !on && darkChip, on && styles.tchipOn]}
                        >
                          <Text style={[styles.tchipText, !on && darkChipText, on && styles.tchipTextOn]}>
                            {m === 'manual' ? '自分で入力' : '候補から選ぶ'}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                ) : null}
                {candidates.length > 0 && mkMode === 'pick' ? (
                  <View>
                    {label('追加済みの補講')}
                    {/* 選ぶと日程は変更不可（入力欄を出さない）。変えたい時は「自分で入力」へ切り替える。行はフラット行＋区切り線。 */}
                    {candidates.map((c, i) => {
                      const on = isMakeupPicked({ makeupStatus, mkDate, mkPeriods, mkRoom }, c)
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => pickMakeup(c)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={makeupPickA11yLabel(c)}
                          style={[
                            styles.pickRow,
                            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor },
                          ]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.pickText, { color: ui.valueColor }]}>{makeupPickRowText(c)}</Text>
                            {c.note ? (
                              <Text style={[styles.hint, { color: ui.labelColor }]} numberOfLines={1}>
                                {c.note}
                              </Text>
                            ) : null}
                          </View>
                          {on ? (
                            <View style={styles.pickOn}>
                              <Ionicons name="checkmark-circle" size={18} color={ui.valueColor} />
                              <Text style={[styles.pickOnText, { color: ui.valueColor }]}>選択中</Text>
                            </View>
                          ) : null}
                        </Pressable>
                      )
                    })}
                    <Text style={[styles.hint, { color: ui.labelColor, marginTop: 8 }]}>
                      選んだら、下の「{editId ? '保存' : '追加'}」で確定します。
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
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
                )}
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
  // 「追加済みの補講から選ぶ」の行（フラット行＋区切り線）。タッチ高さ 44pt 以上。
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 8 },
  pickText: { fontSize: 15 },
  pickOn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickOnText: { fontSize: 13, fontWeight: '600' },
  error: { fontSize: 13, marginHorizontal: 4 },
  saveBtn: { backgroundColor: COLORS.cta, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  deleteBtn: { borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  deleteText: { fontSize: 15, fontWeight: '600' },
})
