import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS } from '../theme'
import type { TimetableStackParamList } from '../navigation/types'
import { makePersonalEventId, PERSONAL_DAYS, type PersonalDayKey, type PersonalEvent } from '../timetableEvents/personalEvent'
import { loadPersonalEvents, upsertPersonalEvent, removePersonalEvent } from '../storage/personalEventsStore'

type Nav = NativeStackNavigationProp<TimetableStackParamList>
type Rt = RouteProp<TimetableStackParamList, 'PersonalEventForm'>

const DAY_LABEL: Record<PersonalDayKey, string> = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日' }
const PERIOD_CANDIDATES = [0, 1, 2, 3, 4, 5, 6]

function toggle(arr: number[], p: number): number[] {
  return (arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]).sort((a, b) => a - b)
}

export default function PersonalEventFormScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<Rt>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { editId, day: initDay, period: initPeriod } = route.params ?? {}

  const [title, setTitle] = useState('')
  const [day, setDay] = useState<PersonalDayKey>(initDay ?? 'mon')
  const [periods, setPeriods] = useState<number[]>(initPeriod != null ? [initPeriod] : [1])
  const [place, setPlace] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editId) return
    loadPersonalEvents().then((list) => {
      const e = list.find((x) => x.id === editId)
      if (!e) return
      setTitle(e.title)
      setDay(e.day)
      setPeriods(e.periods.length ? e.periods : [1])
      setPlace(e.place ?? '')
      setNote(e.note ?? '')
    })
  }, [editId])

  async function onSave() {
    if (!title.trim()) {
      setError('タイトルを入力してください')
      return
    }
    if (periods.length === 0) {
      setError('時限を1つ以上選んでください')
      return
    }
    const now = new Date()
    const id = editId ?? makePersonalEventId({ createdAt: now.toISOString(), title: title.trim(), day })
    const ev: PersonalEvent = {
      id,
      title: title.trim(),
      day,
      periods,
      place: place.trim() || null,
      note: note.trim() || null,
      color: null,
      createdAt: now.toISOString(),
    }
    await upsertPersonalEvent(ev)
    nav.goBack()
  }

  function onDelete() {
    if (!editId) return
    Alert.alert('削除しますか？', 'この個人予定を削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await removePersonalEvent(editId)
          nav.goBack()
        },
      },
    ])
  }

  const label = (s: string) => <Text style={[styles.label, { color: ui.labelColor }]}>{s}</Text>

  return (
    <ScreenBg>
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]} keyboardShouldPersistTaps="handled">
        <View style={[ui.card, styles.card]}>
          {label('タイトル')}
          <TextInput
            style={[styles.input, { color: ui.valueColor }]}
            value={title}
            onChangeText={setTitle}
            placeholder="例: バイト / サークル"
            placeholderTextColor="#9aa8a2"
          />
        </View>

        <View style={[ui.card, styles.card]}>
          {label('曜日')}
          <View style={styles.chipRow}>
            {PERSONAL_DAYS.map((d) => {
              const on = day === d
              return (
                <Pressable key={d} onPress={() => setDay(d)} style={[styles.tchip, on && styles.tchipOn]}>
                  <Text style={[styles.tchipText, on && styles.tchipTextOn]}>{DAY_LABEL[d]}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={[ui.card, styles.card]}>
          {label('時限（複数選択可・0=早朝）')}
          <View style={styles.chipRow}>
            {PERIOD_CANDIDATES.map((p) => {
              const on = periods.includes(p)
              return (
                <Pressable key={p} onPress={() => setPeriods((v) => toggle(v, p))} style={[styles.pchip, on && styles.pchipOn]}>
                  <Text style={[styles.pchipText, on && styles.pchipTextOn]}>{p}限</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={[ui.card, styles.card]}>
          {label('場所（任意）')}
          <TextInput
            style={[styles.input, { color: ui.valueColor }]}
            value={place}
            onChangeText={setPlace}
            placeholder="例: 駅前カフェ"
            placeholderTextColor="#9aa8a2"
          />
        </View>

        <View style={[ui.card, styles.card]}>
          {label('メモ（実時刻など・任意）')}
          <TextInput
            style={[styles.input, { color: ui.valueColor }]}
            value={note}
            onChangeText={setNote}
            placeholder="例: 18:30〜23:00"
            placeholderTextColor="#9aa8a2"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.saveBtn} onPress={onSave}>
          <Text style={styles.saveText}>{editId ? '保存' : '追加'}</Text>
        </Pressable>
        {editId ? (
          <Pressable style={styles.deleteBtn} onPress={onDelete}>
            <Text style={styles.deleteText}>削除</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: 8, paddingBottom: 40, gap: 12 },
  card: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: '#f1f8f5', borderWidth: 1, borderColor: '#cfe0d9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tchip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: '#eef5f2', borderWidth: 1, borderColor: '#cfe0d9' },
  tchipOn: { backgroundColor: COLORS.cta, borderColor: COLORS.cta },
  tchipText: { fontSize: 13, color: COLORS.emeraldDark, fontWeight: '600' },
  tchipTextOn: { color: '#ffffff' },
  pchip: { width: 46, paddingVertical: 8, borderRadius: 12, backgroundColor: '#eef5f2', borderWidth: 1, borderColor: '#cfe0d9', alignItems: 'center' },
  pchipOn: { backgroundColor: COLORS.cta, borderColor: COLORS.cta },
  pchipText: { fontSize: 13, color: COLORS.emeraldDark, fontWeight: '600' },
  pchipTextOn: { color: '#ffffff' },
  error: { color: '#c0392b', fontSize: 13, marginHorizontal: 4 },
  saveBtn: { backgroundColor: COLORS.cta, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  deleteBtn: { borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e3b0a6', backgroundColor: '#fdf0ed' },
  deleteText: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
})
