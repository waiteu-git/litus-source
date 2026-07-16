import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS, DARK } from '../theme'
import type { AssignmentsStackParamList } from '../navigation/types'
import { loadAssignments, upsertAssignment, removeAssignment } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { notifyWidgetDataChanged } from '../widget/updateWidget'
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
    // 締切の追加・変更は通知予約とウィジェットに即反映する（旧実装は次回収集まで反映されなかった）。
    refreshAllNotifications().catch(() => undefined)
    notifyWidgetDataChanged()
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
          refreshAllNotifications().catch(() => undefined)
          notifyWidgetDataChanged()
          navigation.goBack()
        },
      },
    ])
  }

  const inputStyle = { backgroundColor: ui.inputBg, borderColor: ui.colors.inputBorder }
  const phColor = ui.dark ? DARK.label : ui.subMuted
  const label = (s: string) => <Text style={[styles.label, { color: ui.labelColor }]}>{s}</Text>

  return (
    <ScreenBg>
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]} keyboardShouldPersistTaps="handled">
        <View style={[ui.card, styles.card]}>
          {label('タイトル')}
          <TextInput
            style={[styles.input, inputStyle, { color: ui.valueColor }]}
            value={title}
            onChangeText={setTitle}
            placeholder="例: 第3回レポート"
            placeholderTextColor={phColor}
          />
        </View>

        <View style={[ui.card, styles.card]}>
          {label('科目名（任意）')}
          <TextInput
            style={[styles.input, inputStyle, { color: ui.valueColor }]}
            value={courseName}
            onChangeText={setCourseName}
            placeholder="例: 哲学"
            placeholderTextColor={phColor}
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

        {error ? <Text style={[styles.error, { color: ui.colors.danger }]}>{error}</Text> : null}

        <Pressable style={styles.saveBtn} onPress={onSave}>
          <Text style={styles.saveText}>{existing ? '保存' : '追加'}</Text>
        </Pressable>

        {existing ? (
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
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  error: { fontSize: 13, marginHorizontal: 4 },
  saveBtn: { backgroundColor: COLORS.cta, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  deleteBtn: { borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  deleteText: { fontSize: 15, fontWeight: '600' },
})
