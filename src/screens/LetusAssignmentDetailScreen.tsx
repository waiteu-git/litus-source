import { useEffect, useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ActionButton, useUi } from '../ui/screen'
import { COLORS, useThemeVariant } from '../theme'
import type { AssignmentsStackParamList } from '../navigation/types'
import { loadAssignments } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AssignmentSubmissionStatus } from '../parsers/letus'

const STATUS_LABEL: Record<AssignmentSubmissionStatus, string> = {
  not_submitted: '未提出',
  submitted: '提出済み',
  completed: '受験済み',
  unknown: '未提出',
}

function relDue(iso: string | null, now: Date): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sec = Math.floor((d.getTime() - now.getTime()) / 1000)
  if (sec <= 0) return '締切超過'
  const day = Math.floor(sec / 86400)
  if (day >= 1) return `あと${day}日`
  const h = Math.floor(sec / 3600)
  if (h >= 1) return `あと${h}時間`
  return `あと${Math.max(1, Math.floor(sec / 60))}分`
}

function formatDeadline(iso: string | null): string {
  if (!iso) return '締切未設定'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '締切未設定'
  const mm = d.getMonth() + 1
  const dd = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

/**
 * LETUS課題の自前UI詳細（Turn4で確定した4d・提出パネル強調）。
 * 収集済みメタデータ（締切・提出状況）のみを自前表示する。課題本文・添付ファイルは現状
 * LETUS側にしか無い（一覧収集は件名/締切/提出状況のみを抽出しており本文パーサは未実装）ため、
 * 「LETUSで開く」でWebViewへ橋渡しする。本文の自前表示は専用パーサが要る続きの作業として扱う。
 */
export default function LetusAssignmentDetailScreen() {
  const route = useRoute<RouteProp<AssignmentsStackParamList, 'LetusAssignmentDetail'>>()
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const { variant } = useThemeVariant()
  const ui = useUi()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    loadAssignments().then((map) => setAssignment(map[route.params.url] ?? null))
  }, [route.params.url])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  if (!assignment) {
    return (
      <View style={styles.root}>
        {variant === 'green' ? <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={StyleSheet.absoluteFill} /> : null}
        <View style={styles.body}>
          <Text style={{ color: ui.valueColor }}>課題情報が見つかりませんでした。</Text>
        </View>
      </View>
    )
  }

  const submitted = assignment.submissionStatus === 'submitted' || assignment.submissionStatus === 'completed'
  const rel = relDue(assignment.deadline, now)
  const urgent = !submitted && !!assignment.deadline && new Date(assignment.deadline).getTime() - now.getTime() <= 24 * 3600 * 1000

  return (
    <View style={styles.root}>
      {variant === 'green' ? <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={StyleSheet.absoluteFill} /> : null}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[ui.card, styles.panel]}>
          <View style={[styles.courseTag, { backgroundColor: ui.green ? 'rgba(255,255,255,0.5)' : '#d6efe4' }]}>
            <Text style={[styles.courseTagText, { color: ui.green ? '#04322a' : COLORS.emeraldDark }]}>
              {assignment.courseName || '科目不明'}
            </Text>
          </View>
          <Text style={[styles.title, { color: ui.valueColor }]}>{assignment.title}</Text>

          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: urgent ? '#fff2ef' : ui.green ? 'rgba(255,255,255,0.24)' : '#f1f8f5' }]}>
              <Text style={[styles.statLabel, { color: urgent ? '#a33417' : ui.labelColor }]}>締切まで</Text>
              <Text style={[styles.statValue, { color: urgent ? '#e0533a' : ui.valueColor }]}>{rel || '—'}</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: ui.green ? 'rgba(255,255,255,0.24)' : '#f1f8f5' }]}>
              <Text style={[styles.statLabel, { color: ui.labelColor }]}>提出状況</Text>
              <Text style={[styles.statValue, { color: ui.valueColor }]}>{STATUS_LABEL[assignment.submissionStatus]}</Text>
            </View>
          </View>

          <Text style={[styles.deadlineText, { color: ui.labelColor }]}>期限: {formatDeadline(assignment.deadline)}</Text>

          <ActionButton
            label="LETUSで開く ↗"
            onPress={() => navigation.navigate('Web', { url: assignment.url, title: assignment.title })}
          />
        </View>

        <View style={[ui.card, { marginTop: 12 }]}>
          <Text style={{ color: ui.labelColor, fontSize: 12, lineHeight: 19 }}>
            課題の説明・添付ファイルはLETUS側にのみ保持されています。「LETUSで開く」から確認・提出してください。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 14, paddingBottom: 28 },
  panel: { gap: 4 },
  courseTag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  courseTagText: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', marginTop: 10, lineHeight: 25 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statBox: { flex: 1, borderRadius: 13, padding: 11 },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 16, fontWeight: '700', marginTop: 3 },
  deadlineText: { fontSize: 12, marginTop: 12, marginBottom: 14 },
})
