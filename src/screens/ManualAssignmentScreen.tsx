import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS } from '../theme'
import type { AssignmentsStackParamList } from '../navigation/types'
import { loadAssignments, upsertAssignment, removeAssignment } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'
import DeadlineFields from '../assignments/DeadlineFields'
import {
  MANUAL_PREFIX,
  parseDeadlineInput,
  formatDeadlineText,
  splitDeadline,
  makeManualAssignment,
} from '../assignments/manualAssignment'

type Nav = NativeStackNavigationProp<AssignmentsStackParamList>
type Rt = RouteProp<AssignmentsStackParamList, 'ManualAssignment'>

export default function ManualAssignmentScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Rt>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { bump } = useAssignmentsVersion()
  const editUrl = route.params?.url ?? null
  const presetCourseName = route.params?.presetCourseName ?? ''

  const [existing, setExisting] = useState<Assignment | null>(null)
  const [title, setTitle] = useState('')
  const [courseName, setCourseName] = useState('')
  const [noDeadline, setNoDeadline] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('23:59')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editUrl) return
    loadAssignments().then((m) => {
      const a = m[editUrl]
      if (!a) return
      setExisting(a)
      setTitle(a.title)
      setCourseName(a.courseName === '手動追加' ? '' : a.courseName)
      if (a.deadline) {
        const s = splitDeadline(a.deadline)
        setDate(s.date)
        setTime(s.time)
        setNoDeadline(false)
      } else {
        setNoDeadline(true)
      }
    })
  }, [editUrl])

  // 新規追加（編集でない）かつ科目詳細からのプリセットがあれば科目名を初期化する。
  useEffect(() => {
    if (editUrl) return
    if (presetCourseName) setCourseName(presetCourseName)
  }, [editUrl, presetCourseName])

  async function onSave() {
    const t = title.trim()
    if (!t) {
      setError('タイトルを入力してください')
      return
    }
    let deadline: string | null = null
    if (!noDeadline) {
      deadline = parseDeadlineInput(date, time)
      if (!deadline) {
        setError('締切の日付/時刻の形式を確認してください（例: 2026/07/15 23:59）')
        return
      }
    }
    const now = new Date().toISOString()
    if (existing) {
      await upsertAssignment({
        ...existing,
        title: t,
        courseName: courseName.trim() || '手動追加',
        deadline,
        deadlineText: formatDeadlineText(deadline),
        lastCheckedAt: now,
      })
    } else {
      const id = `${MANUAL_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await upsertAssignment(makeManualAssignment({ title: t, courseName, deadline }, id, now))
    }
    bump()
    navigation.goBack()
  }

  function onDelete() {
    if (!editUrl) return
    Alert.alert('削除しますか？', 'この手動課題を削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await removeAssignment(editUrl)
          bump()
          navigation.goBack()
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
            placeholder="例: 第3回レポート"
            placeholderTextColor="#9aa8a2"
          />
        </View>

        <View style={[ui.card, styles.card]}>
          {label('科目名（任意）')}
          <TextInput
            style={[styles.input, { color: ui.valueColor }]}
            value={courseName}
            onChangeText={setCourseName}
            placeholder="例: 哲学"
            placeholderTextColor="#9aa8a2"
          />
        </View>

        <View style={[ui.card, styles.card]}>
          <DeadlineFields
            value={{ noDeadline, date, time }}
            onChange={(v) => { setNoDeadline(v.noDeadline); setDate(v.date); setTime(v.time) }}
            valueColor={ui.valueColor}
            labelColor={ui.labelColor}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.saveBtn} onPress={onSave}>
          <Text style={styles.saveText}>{existing ? '保存' : '追加'}</Text>
        </Pressable>

        {existing ? (
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
  input: {
    backgroundColor: '#f1f8f5',
    borderWidth: 1,
    borderColor: '#cfe0d9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  error: { color: '#c0392b', fontSize: 13, marginHorizontal: 4 },
  saveBtn: { backgroundColor: COLORS.cta, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  deleteBtn: { borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e3b0a6', backgroundColor: '#fdf0ed' },
  deleteText: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
})
