import { useCallback, useEffect, useRef, useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import { ActionButton, useUi } from '../ui/screen'
import { COLORS, DARK } from '../theme'
import type { AssignmentsStackParamList } from '../navigation/types'
import { loadAssignments, mutateAssignments, removeAssignment } from '../storage/assignmentsStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import type { Assignment } from '../storage/assignmentsSerialize'
import type { AssignmentSubmissionStatus } from '../parsers/letus'
import { loadLetusBody } from '../storage/letusBodyStore'
import type { LetusBody } from '../storage/letusBodySerialize'
import LetusPageFetcher from '../collect/LetusPageFetcher'
import { isUserManagedUrl } from '../assignments/assignmentOwnership'
import { isPdfLikeUrl } from '../collect/injectedScripts'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'
import { parseDeadlineInput, splitDeadline, formatDeadlineText } from '../assignments/manualAssignment'
import DeadlineFields, { type DeadlineValue } from '../assignments/DeadlineFields'
import { isSubmitted } from '../assignments/deadline'

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
  const ui = useUi()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [body, setBody] = useState<LetusBody | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const startedRef = useRef(false)
  const { bump } = useAssignmentsVersion()
  const [editingDeadline, setEditingDeadline] = useState(false)
  const [dlValue, setDlValue] = useState<DeadlineValue>({ noDeadline: false, date: '', time: '23:59' })

  // 収集所有(mod/assign等・収集器が上書き)か、ユーザー所有(resource/PDF等・手動追加/manual://)かを
  // URLから導出。ユーザー所有は本文フェッチャを起動せず、締切編集・提出トグル・削除をここで完結させる。
  const userManaged = assignment ? isUserManagedUrl(assignment.url) : false

  useEffect(() => {
    loadAssignments().then((map) => setAssignment(map[route.params.url] ?? null))
  }, [route.params.url])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  // 本文キャッシュを読み込む。
  useEffect(() => {
    loadLetusBody().then((m) => setBody(m[route.params.url] ?? null))
  }, [route.params.url])

  // 画面を開いたら一度だけ取得を起動（キャッシュ有無に関わらず裏で最新化）。
  // ユーザー所有アクティビティ(PDF/resource等)では起動しない＝自動ダウンロードを回避する。
  useEffect(() => {
    if (!assignment || userManaged || startedRef.current) return
    startedRef.current = true
    setFetching(true)
  }, [assignment, userManaged])

  const onFetched = useCallback(
    async (_r: { ok: boolean }) => {
      setFetching(false)
      const m = await loadLetusBody()
      const b = m[route.params.url] ?? null
      setBody(b)
      if (!b) setFetchFailed(true)
    },
    [route.params.url],
  )

  const retryFetch = useCallback(() => {
    setFetchFailed(false)
    setFetching(true)
    startedRef.current = true
  }, [])

  // 提出トグル（未提出⇄提出済み）。現在状態の判定は既存 isSubmitted(a) を再利用する。
  async function toggleSubmission() {
    if (!assignment) return
    const next: AssignmentSubmissionStatus = isSubmitted(assignment) ? 'not_submitted' : 'submitted'
    const m = await mutateAssignments((map) =>
      map[assignment.url] ? { ...map, [assignment.url]: { ...map[assignment.url], submissionStatus: next } } : map,
    )
    setAssignment(m[assignment.url] ?? null)
    bump()
    refreshAllNotifications().catch(() => undefined)
  }

  function openDeadlineEdit() {
    if (!assignment) return
    const s = splitDeadline(assignment.deadline)
    setDlValue({ noDeadline: assignment.deadline === null, date: s.date, time: s.time || '23:59' })
    setEditingDeadline(true)
  }

  async function saveDeadline() {
    if (!assignment) return
    const iso = dlValue.noDeadline ? null : parseDeadlineInput(dlValue.date, dlValue.time)
    if (!dlValue.noDeadline && !iso) {
      Alert.alert('締切の形式が不正です', '日付/時刻の形式を確認してください（例: 2026/07/15 23:59）')
      return
    }
    const m = await mutateAssignments((map) =>
      map[assignment.url]
        ? { ...map, [assignment.url]: { ...map[assignment.url], deadline: iso, deadlineText: formatDeadlineText(iso) } }
        : map,
    )
    setAssignment(m[assignment.url] ?? null)
    setEditingDeadline(false)
    bump()
    refreshAllNotifications().catch(() => undefined)
  }

  function confirmDelete() {
    if (!assignment) return
    Alert.alert('削除しますか？', 'この課題を一覧から削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await removeAssignment(assignment.url)
          bump()
          refreshAllNotifications().catch(() => undefined)
          navigation.goBack()
        },
      },
    ])
  }

  if (!assignment) {
    return (
      <View style={styles.root}>
        {ui.colors.gradient ? <LinearGradient colors={ui.colors.gradient} style={StyleSheet.absoluteFill} /> : null}
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
      {ui.colors.gradient ? <LinearGradient colors={ui.colors.gradient} style={StyleSheet.absoluteFill} /> : null}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[ui.card, styles.panel]}>
          <View style={[styles.courseTag, { backgroundColor: ui.pillBg }]}>
            <Text style={[styles.courseTagText, { color: ui.pillText }]}>
              {assignment.courseName || '科目不明'}
            </Text>
          </View>
          <Text style={[styles.title, { color: ui.valueColor }]}>{assignment.title}</Text>

          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: urgent ? '#fff2ef' : ui.softBoxBg }]}>
              <Text style={[styles.statLabel, { color: urgent ? '#a33417' : ui.labelColor }]}>締切まで</Text>
              <Text style={[styles.statValue, { color: urgent ? '#e0533a' : ui.valueColor }]}>{rel || '—'}</Text>
            </View>
            {userManaged ? (
              <Pressable
                style={[styles.statBox, { backgroundColor: ui.softBoxBg }]}
                onPress={toggleSubmission}
              >
                <Text style={[styles.statLabel, { color: ui.labelColor }]}>提出状況（タップで切替）</Text>
                <Text style={[styles.statValue, { color: ui.valueColor }]}>{isSubmitted(assignment) ? '提出済み' : '未提出'}</Text>
              </Pressable>
            ) : (
              <View style={[styles.statBox, { backgroundColor: ui.softBoxBg }]}>
                <Text style={[styles.statLabel, { color: ui.labelColor }]}>提出状況</Text>
                <Text style={[styles.statValue, { color: ui.valueColor }]}>{STATUS_LABEL[assignment.submissionStatus]}</Text>
              </View>
            )}
          </View>

          <View style={styles.deadlineRow}>
            <Text style={[styles.deadlineText, { color: ui.labelColor }]}>期限: {formatDeadline(assignment.deadline)}</Text>
            {userManaged ? (
              <Pressable onPress={openDeadlineEdit} style={[styles.editLinkBtn, ui.dark && { backgroundColor: DARK.softBox }]}>
                <Text style={[styles.editLinkText, ui.dark && { color: COLORS.emeraldLight }]}>編集</Text>
              </Pressable>
            ) : null}
          </View>

          <ActionButton
            label="LETUSで開く ↗"
            onPress={() => navigation.navigate('Web', { url: assignment.url, title: assignment.title })}
          />
        </View>

        {userManaged ? (
          <View style={[ui.card, { marginTop: 12, gap: 10 }]}>
            <Text style={{ color: ui.labelColor, fontSize: 12 }}>
              このアクティビティは自動収集の対象外です。締切・提出状況は手動で管理します。
            </Text>
            <ActionButton
              label={isPdfLikeUrl(assignment.url) ? 'PDFをプレビュー ↗' : 'LETUSで開く ↗'}
              onPress={() => navigation.navigate('Web', { url: assignment.url, title: assignment.title })}
            />
            <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
              <Text style={styles.deleteText}>削除</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[ui.card, { marginTop: 12 }]}>
            {body ? (
              <>
                <Text style={{ color: ui.valueColor, fontSize: 14, lineHeight: 22 }}>
                  {body.description || '（本文なし）'}
                </Text>
                {body.attachments.length > 0 ? (
                  <View style={{ marginTop: 14, gap: 8 }}>
                    <Text style={{ color: ui.labelColor, fontSize: 12 }}>添付ファイル</Text>
                    {body.attachments.map((att) => (
                      <Pressable
                        key={att.url}
                        onPress={() => navigation.navigate('Web', { url: att.url, title: att.name })}
                        style={[styles.attachRow, ui.dark && { backgroundColor: DARK.softBox }]}
                      >
                        <Ionicons name="document-attach-outline" size={18} color={ui.accent} />
                        <Text style={{ color: ui.accent, fontSize: 13, flex: 1 }} numberOfLines={1}>
                          {att.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {fetching ? (
                  <Text style={{ color: ui.labelColor, fontSize: 11, marginTop: 10 }}>更新中…</Text>
                ) : null}
              </>
            ) : fetchFailed ? (
              <View style={{ alignItems: 'center', paddingVertical: 8, gap: 10 }}>
                <Text style={{ color: ui.labelColor, fontSize: 13, textAlign: 'center' }}>
                  本文を取得できませんでした。上の「LETUSで開く」から確認してください。
                </Text>
                <Pressable onPress={retryFetch} style={styles.retryBtn}>
                  <Ionicons name="refresh" size={15} color={ui.accent} />
                  <Text style={{ color: ui.accent, fontWeight: '600', fontSize: 13 }}>再試行</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                <ActivityIndicator color={ui.accent} />
                <Text style={{ color: ui.labelColor, marginTop: 8, fontSize: 12 }}>本文を取得しています…</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {fetching ? <LetusPageFetcher url={assignment.url} onFinished={onFetched} /> : null}

      {userManaged ? (
        <Modal visible={editingDeadline} transparent animationType="slide" onRequestClose={() => setEditingDeadline(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setEditingDeadline(false)} />
          <View style={[styles.modalSheet, ui.dark && { backgroundColor: DARK.card }]}>
            <Text style={[styles.modalTitle, ui.dark && { color: DARK.heading }]}>締切を編集</Text>
            <DeadlineFields
              value={dlValue}
              onChange={setDlValue}
              valueColor={ui.dark ? DARK.value : '#123'}
              labelColor={ui.dark ? DARK.label : '#5a6b64'}
            />
            <Pressable style={styles.editSaveBtn} onPress={saveDeadline}>
              <Text style={styles.editSaveText}>保存</Text>
            </Pressable>
          </View>
        </Modal>
      ) : null}
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
  deadlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 14 },
  deadlineText: { fontSize: 12 },
  editLinkBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#eef5f2' },
  editLinkText: { fontSize: 12, fontWeight: '600', color: COLORS.emeraldDark },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f1f8f5',
  },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteBtn: {
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e3b0a6',
    backgroundColor: '#fdf0ed',
  },
  deleteText: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30, gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#123' },
  editSaveBtn: { backgroundColor: COLORS.cta, borderRadius: 14, height: 50, alignItems: 'center', justifyContent: 'center' },
  editSaveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
