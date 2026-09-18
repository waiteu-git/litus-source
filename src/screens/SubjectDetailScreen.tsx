// app/src/screens/SubjectDetailScreen.tsx
import { cloneElement, Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SectionLabel, Segmented, useUi, useTabBarClearance } from '../ui/screen'
import { Accordion } from '../ui/Accordion'
import { LinkRow } from '../ui/LinkRow'
import { joinA11yLabel } from '../ui/a11yState'
import { loadTimetable } from '../storage/timetableStore'
import { loadTimetableOverrides, saveTimetableOverride } from '../storage/timetableOverridesStore'
import { isQuarterSlot } from '../timetableEvents/quarter'
import type { Quarter } from '../parsers/timetable'
import { resolveNextSession, pickAttentionEvent, type NextSession } from '../timetableEvents/nextSession'
import { COLORS } from '../theme'
import type { TimetableStackParamList } from '../navigation/types'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadCourseNews, mutateCourseNews } from '../storage/courseNewsStore'
import { markCourseSeen, type CourseNewsItem } from '../updates/courseNews'
import { buildSyllabusUrl } from '../links/syllabus'
import { useDisplaySettings } from '../displaySettings'
import type { SubjectSectionKey } from '../subject/subjectSections'
import { subjectEventsHeaderSlots } from '../subject/eventsHeader'
import { loadClassEvents, upsertClassEvent } from '../storage/classEventsStore'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { cellBadgeText } from '../timetableEvents/eventLabels'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import { useBulletinEventCandidates } from '../timetableEvents/useBulletinEventCandidates'
import { candidateToClassEvent, type CandidateView } from '../timetableEvents/bulletinEvents'
import BulletinCandidateRow from '../timetableEvents/BulletinCandidateRow'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { loadWeeklyPatterns } from '../storage/weeklyPatternStore'
import type { WeeklyPattern } from '../timetableEvents/weeklyPattern'
import { loadAttendanceStats } from '../storage/attendanceStatsStore'
import { loadAttendanceOverrides } from '../storage/attendanceOverridesStore'
import { computeAttendanceRisk, type AttendanceRisk } from '../attendance/attendanceRisk'
import { useAttendanceVersion } from '../attendance/attendanceVersion'
import { resolveTermDates, deriveExcludedDates } from '../attendance/attendanceTerm'
import type { AttendanceCourseStats } from '../parsers/attendanceStats'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import { courseUnreadCounts } from '../timetableEvents/courseUnread'

type IconName = keyof typeof Ionicons.glyphMap

function InfoChip({ icon, label }: { icon: IconName; label: string }) {
  const ui = useUi()
  return (
    <View style={[styles.chip, { backgroundColor: ui.colors.chipBg, borderWidth: 1, borderColor: ui.colors.chipBorder }]}>
      <Ionicons name={icon} size={12} color={ui.pillText} />
      <Text style={[styles.chipText, { color: ui.pillText }]}>{label}</Text>
    </View>
  )
}

function LinkAction({ icon, title, sub, onPress }: { icon: IconName; title: string; sub?: string; onPress?: () => void }) {
  const ui = useUi()
  return (
    <Pressable style={[ui.card, styles.linkRow]} onPress={onPress}>
      <View style={[styles.linkIcon, { backgroundColor: ui.softBoxBg }]}>
        <Ionicons name={icon} size={19} color={ui.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.linkTitle, { color: ui.valueColor }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.linkSub, { color: ui.labelColor }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={ui.chevron} />
    </Pressable>
  )
}

function SubjectSummaryCard({
  rows,
}: {
  rows: { key: string; icon: IconName; text: string; attention?: boolean; onPress?: () => void }[]
}) {
  const ui = useUi()
  if (rows.length === 0) return null
  return (
    <View style={[ui.card, { marginBottom: 10, gap: 8 }]}>
      {rows.map((r) => {
        const color = r.attention ? ui.colors.danger : ui.valueColor
        const body = (
          <View style={styles.summaryRow}>
            <Ionicons name={r.icon} size={16} color={color} />
            <Text style={[styles.summaryText, { color }]} numberOfLines={1}>
              {r.text}
            </Text>
            {r.onPress ? <Ionicons name="chevron-forward" size={15} color={ui.chevron} /> : null}
          </View>
        )
        return r.onPress ? (
          <Pressable key={r.key} onPress={r.onPress}>
            {body}
          </Pressable>
        ) : (
          cloneElement(body, { key: r.key })
        )
      })}
    </View>
  )
}

export default function SubjectDetailScreen() {
  const route = useRoute<RouteProp<TimetableStackParamList, 'SubjectDetail'>>()
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const { courseCode, name, day, dayKey, period, room, teachers, isRemote } = route.params
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { version, bump } = useClassEventsVersion()
  const candidates = useBulletinEventCandidates(courseCode, name)
  // セクションの並び・表示は設定＞表示「科目詳細の並び」で全科目共通に変更できる。
  const { subjectLayout } = useDisplaySettings()
  const [letusUrl, setLetusUrl] = useState<string | null>(null)
  // このコースの未読LETUS新着（更新状況セクション。見るまで残る累積・markCourseSeenで消える）。
  const [news, setNews] = useState<CourseNewsItem[]>([])
  const [events, setEvents] = useState<ClassEvent[]>([])
  const [pattern, setPattern] = useState<WeeklyPattern>({})
  // 積みコマ（同曜限2科目以上）の半期指定（§9E）。積みでない科目では常にfalse/null＝セクション非表示。
  const [isStacked, setIsStacked] = useState(false)
  const [quarterPref, setQuarterPref] = useState<Quarter | null>(null)
  const [attStats, setAttStats] = useState<AttendanceCourseStats | null>(null)
  const [attTotal, setAttTotal] = useState<number | null>(null)
  // 出欠データを一度でも収集済みか。未収集だと trackable 判定すらできず従来はセクション自体が消えて
  // 「機能が存在しないように見える」ため、未収集時は案内を出す（初期値trueで案内のチラつきを防ぐ）。
  const [attCollected, setAttCollected] = useState(true)
  // 出欠収集の完了通知（この画面を開いたまま同期が完走したら再読込するため版数を購読）。
  const { version: attVersion } = useAttendanceVersion()
  const attVersionRef = useRef(attVersion)
  const [unread, setUnread] = useState(0)
  // 出欠の各回日付を実日付へ解決（隔週の非実施週除外・実施パターンの週リスト生成に使う）。
  const resolvedSessions = useMemo(
    () => resolveTermDates(attStats?.sessions ?? [], new Date()),
    [attStats],
  )
  const syllabusUrl = buildSyllabusUrl(courseCode, new Date())

  // 実施パターンの唯一の書き手は SubjectSchedule 画面（updatePattern）になったため、マウント時
  // 1回では編集して戻っても古い値が残る（native stack では push しても本画面はアンマウントされない）。
  // pattern は LinkRow のサブタイトル・excludeDates→risk・resolveNextSession の「次回」行を駆動する
  // ので、attStats と対称にフォーカス毎の再読込にする（courseNews と同じ形）。
  useFocusEffect(
    useCallback(() => {
      let active = true
      ;(async () => {
        const m = await loadWeeklyPatterns()
        if (active) setPattern(m[courseCode] ?? {})
      })().catch(() => undefined)
      return () => {
        active = false
      }
    }, [courseCode]),
  )

  // 積みコマ検出＋現在の半期指定ロード（§9E）。CLASSは前半/後半を公開しないため手動指定のみが情報源。
  useEffect(() => {
    ;(async () => {
      const cols = await loadTimetable()
      let stacked = false
      for (const c of cols ?? []) {
        for (const s of c.slots) {
          if (isQuarterSlot(s) && s.classes.some((cl) => cl.courseCode === courseCode)) stacked = true
        }
      }
      setIsStacked(stacked)
      const ov = await loadTimetableOverrides()
      setQuarterPref(ov[courseCode]?.quarter ?? null)
    })().catch(() => undefined)
  }, [courseCode])

  // SubjectSchedule 画面での総回数の手動調整（changeTotal）が戻ってきた時に反映されるよう、
  // マウント時だけでなくフォーカス毎に再読込する（courseNews と同じ理由・設計からの調整2）。
  useFocusEffect(
    useCallback(() => {
      let active = true
      ;(async () => {
        const data = await loadAttendanceStats()
        if (!active) return
        setAttCollected(data !== null)
        const found = data?.courses.find((c) => c.courseCode === courseCode) ?? null
        setAttStats(found)
        const ov = await loadAttendanceOverrides()
        if (active) setAttTotal(ov[courseCode]?.total ?? null)
      })().catch(() => undefined)
      return () => {
        active = false
      }
    }, [courseCode]),
  )

  // 画面に留まったままCLASS同期が完走した場合の即時反映（フォーカスの出入りが起きないため
  // 上の useFocusEffect では拾えない）。版数が実際に変わった時だけ再読込する。
  useEffect(() => {
    if (attVersionRef.current === attVersion) return
    attVersionRef.current = attVersion
    ;(async () => {
      const data = await loadAttendanceStats()
      setAttCollected(data !== null)
      const found = data?.courses.find((c) => c.courseCode === courseCode) ?? null
      setAttStats(found)
    })().catch(() => undefined)
  }, [courseCode, attVersion])

  // 実施パターンで「休み」にした週の回を分子(欠席)・分母(総回数)の両方から除外する。
  // 出欠の詳細UIは SubjectSchedule 画面へ移したが、risk はサマリカードの出欠行に使うため
  // ここでも計算する（設計からの調整1）。
  const excludeDates = useMemo(
    () => deriveExcludedDates(pattern, resolvedSessions),
    [pattern, resolvedSessions],
  )
  const risk: AttendanceRisk | null = useMemo(
    () =>
      attStats
        ? computeAttendanceRisk(attStats, {
            ...(attTotal != null ? { totalOverride: attTotal } : {}),
            ...(excludeDates.length ? { excludeDates } : {}),
          })
        : null,
    [attStats, attTotal, excludeDates],
  )

  // courseNews は他画面（ホーム/LETUSコース一覧）の markCourseSeen や背景同期でも変化するため、
  // マウント時1回でなくフォーカス毎に再読込する（この画面がスタックに残ったまま古い件数を出さない）。
  useFocusEffect(
    useCallback(() => {
      let active = true
      ;(async () => {
        const map = await loadCourseMap()
        const course = map[courseCode] ?? null
        if (!active) return
        setLetusUrl(course?.url ?? null)
        if (course) {
          const newsMap = await loadCourseNews()
          if (active) setNews(newsMap[course.url]?.items ?? [])
        } else {
          setNews([])
        }
      })().catch(() => undefined)
      return () => {
        active = false
      }
    }, [courseCode]),
  )

  // コースを開いた＝新着を確認したとみなし既読化（ホーム/LETUSコース画面と同じ扱い）。
  // これで時間割セルの●・LETUSコース画面の新着カウント・この画面の更新状況セクションも消える。
  const openLetusCourse = () => {
    if (!letusUrl) return
    mutateCourseNews((cur) => markCourseSeen(cur, letusUrl)).catch(() => undefined)
    setNews([])
    navigation.navigate('Web', { url: letusUrl, title: name })
  }

  useEffect(() => {
    loadClassEvents()
      .then((all) => setEvents(all.filter((e) => e.courseName === name).sort((a, b) => (a.date < b.date ? -1 : 1))))
      .catch(() => undefined)
  }, [name, version])

  useEffect(() => {
    loadBulletinDigest()
      .then((d) => setUnread(courseUnreadCounts(d, new Set([courseCode])).get(courseCode) ?? 0))
      .catch(() => undefined)
  }, [courseCode])

  const now = new Date()
  const next = useMemo(
    () => resolveNextSession({ day: dayKey, period, baseRoom: room, pattern, events, now }),
    // now は描画毎に新規だが day/period/room/pattern/events の変化で十分。意図的に now を依存から外す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey, period, room, pattern, events],
  )
  const attention = useMemo(() => pickAttentionEvent(events, now), [events]) // eslint-disable-line react-hooks/exhaustive-deps
  const eventsSlots = subjectEventsHeaderSlots(attention)
  // 「各回の予定」見出しのサブタイトル（表示と読み上げ名で同じ値を使う＝E0 A4）。
  const eventsSubtitle = attention
    ? `直近: ${Number(attention.date.split('-')[1])}/${Number(attention.date.split('-')[2])} ${attention.type === 'cancel' ? '休講' : '教室変更'}`
    : events.length
      ? `${events.length}件`
      : undefined
  // 予定の追加フォームへ（見出しの「追加」ボタンと、読み上げの操作「予定を追加」で共用）。
  const openAddEvent = () => navigation.navigate('ClassEventForm', { courseName: name, courseCode, dayKey })

  const fmtNext = (n: NextSession): string => {
    const [y, mo, d] = n.date.split('-').map(Number)
    const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, mo - 1, d).getDay()]
    const per = n.period != null ? `${n.period}限` : ''
    const rm = n.room ? `・${n.room}` : ''
    const extra = n.note ? `（${n.note}）` : ''
    return `次回 ${mo}/${d}(${wd}) ${per}${rm}${extra}`.trim()
  }

  type SummaryRow = { key: string; icon: IconName; text: string; attention?: boolean; onPress?: () => void }
  const summaryRows: SummaryRow[] = []
  if (next) summaryRows.push({ key: 'next', icon: 'calendar-outline', text: fmtNext(next) })
  if (attention) {
    const [, am, ad] = attention.date.split('-')
    const label = attention.type === 'cancel' ? '休講・補講未入力' : '教室変更'
    summaryRows.push({
      key: 'attn',
      icon: 'alert-circle-outline',
      text: `${Number(am)}/${Number(ad)} ${label}`,
      attention: true,
      onPress: () =>
        navigation.navigate('ClassEventForm', { courseName: name, courseCode, dayKey, editId: attention.id }),
    })
  }
  if (risk && risk.trackable) {
    summaryRows.push({
      key: 'att',
      icon: 'checkmark-circle-outline',
      text: risk.remaining > 0 ? `出欠 あと${risk.remaining}回休める` : '出欠 危険ライン到達',
      attention: risk.level !== 'safe',
    })
  }
  if (unread > 0) {
    summaryRows.push({ key: 'unread', icon: 'mail-unread-outline', text: `未読の掲示 ${unread}件` })
  }

  // 候補[追加]: 候補→ClassEvent を保存し、時間割/通知に反映。掲示idを createdAt に用いて決定論ID。
  const addCandidate = async (v: CandidateView) => {
    await upsertClassEvent(candidateToClassEvent(v.candidate, v.candidate.sourceBulletinId))
    bump()
    refreshAllNotifications().catch(() => undefined)
  }
  // 候補[補講を追記]: 既存の休講イベントに補講日を上書きする。
  const appendMakeup = async (v: CandidateView) => {
    if (!v.matchedEventId || !v.candidate.makeup) return
    const target = (await loadClassEvents()).find((e) => e.id === v.matchedEventId)
    if (!target) return
    await upsertClassEvent({ ...target, makeupStatus: 'has', makeup: v.candidate.makeup })
    bump()
    refreshAllNotifications().catch(() => undefined)
  }

  // セクション本体（キー付きノードマップ）。subjectLayout の順で描画し、enabled=false は出さない。
  // ヒーロー/サマリカードは先頭固定（並び替え対象外）。
  const sectionNodes: Record<SubjectSectionKey, ReactNode> = {
    // 各回の予定: 休講・補講・教室変更・小テスト等（掲示由来の候補を含む）。
    events: (
      <Accordion
        title="各回の予定"
        icon="list-outline"
        subtitle={eventsSubtitle}
        // 読み上げ（E0 A4）: 見出しは1つの読み上げ要素になり、入れ子の「予定を追加」に iOS では届かない（F5）ので
        // 見出しの操作としても出す。名前に right の「要対応」は入らないので、出ている時だけ足す（§9-2）。
        accessibilityLabel={joinA11yLabel('各回の予定', eventsSubtitle, eventsSlots.attentionPill ? '要対応' : null)}
        a11yActions={[{ name: 'addEvent', label: '予定を追加', onAction: openAddEvent }]}
        right={
          <>
            {eventsSlots.attentionPill ? (
              <View style={styles.makeupPill}>
                <Text style={styles.makeupPillText}>要対応</Text>
              </View>
            ) : null}
            <Pressable
              style={[styles.addBtn, { backgroundColor: ui.softBoxBg }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="予定を追加"
              onPress={openAddEvent}
            >
              <Ionicons name="add" size={16} color={ui.accent} />
              <Text style={[styles.addBtnText, { color: ui.accent }]}>追加</Text>
            </Pressable>
          </>
        }
      >
        <Text style={{ color: ui.labelColor, fontSize: 12 }}>休講・補講・教室変更・小テスト等</Text>
        {candidates.length === 0 && events.length === 0 ? (
          <Text style={{ color: ui.labelColor, fontSize: 13, marginTop: 8 }}>
            休講・補講・教室変更・小テスト・中間・期末などを登録できます。
          </Text>
        ) : (
          <View style={ui.card}>
            {/* 区切り線（実線・水平）と候補行の目印（破線・垂直の左境界）は View を分ける。
                borderStyle は辺ごとに指定できないため、同じ View に両方を置くと区切り線まで破線になり、
                Android では辺ごとに幅の違う破線ボーダーの描画自体が不安定になる。 */}
            {candidates.map((v, i) => (
              <View
                key={`cand-${v.candidate.sourceBulletinId}`}
                style={[i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor }]}
              >
                <BulletinCandidateRow view={v} onAdd={() => addCandidate(v)} onAppendMakeup={() => appendMakeup(v)} />
              </View>
            ))}
            {events.map((e, i) => (
              <Pressable
                key={e.id}
                style={[
                  styles.eventRow,
                  (i > 0 || candidates.length > 0) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor },
                ]}
                onPress={() => navigation.navigate('ClassEventForm', { courseName: name, courseCode, dayKey, editId: e.id })}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.eventText, { color: ui.valueColor }]}>{cellBadgeText(e)}</Text>
                  <Text style={[styles.eventSub, { color: ui.labelColor }]}>
                    {e.periods.join('・')}限{e.note ? ` ・ ${e.note}` : ''}
                  </Text>
                </View>
                {e.type === 'cancel' && e.makeupStatus === 'undecided' ? (
                  <View style={styles.makeupPill}>
                    <Text style={styles.makeupPillText}>補講を入力</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={ui.chevron} />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </Accordion>
    ),
    // 更新状況: このコースの未読LETUS新着があるときだけ表示（格納しない＝常時展開のカード）。
    // タップでLETUSコースを開き、markCourseSeen で既読化＝このカード自体も消える（ユーザー要望 2026-07-16）。
    updates:
      news.length > 0 && letusUrl ? (
        <Pressable
          style={[ui.card, styles.updatesCard]}
          onPress={openLetusCourse}
          accessibilityRole="button"
          accessibilityLabel={`LETUS新着${news.length}件・タップでコースを開いて既読にする`}
        >
          <View style={styles.updatesHead}>
            <Ionicons name="sparkles-outline" size={16} color={ui.colors.info} />
            <Text style={[styles.updatesTitle, { color: ui.valueColor }]}>更新状況・新着{news.length}件</Text>
            <Ionicons name="chevron-forward" size={16} color={ui.chevron} />
          </View>
          {news.slice(0, 5).map((n) => (
            <View key={n.url} style={styles.updatesRow}>
              <Text style={[styles.updatesPlus, { color: ui.colors.info }]}>＋</Text>
              <Text style={[styles.updatesText, { color: ui.valueColor }]} numberOfLines={1}>
                {n.title}
              </Text>
            </View>
          ))}
          {news.length > 5 ? (
            <Text style={[styles.updatesMore, { color: ui.labelColor }]}>ほか{news.length - 5}件</Text>
          ) : null}
          <Text style={[styles.updatesHint, { color: ui.labelColor }]}>タップでLETUSコースを開く（開くと既読になります）</Text>
        </Pressable>
      ) : null,
    // リンク: LETUS/シラバス/課題追加。コース更新チェックは時間割の引っ張り更新・同期に統合済み
    // （専用画面 UpdateCheckScreen は v85 で廃止）。
    links: (
      <View>
        <SectionLabel>リンク</SectionLabel>
        {letusUrl ? (
          <LinkAction icon="book-outline" title="LETUSコースを開く" onPress={openLetusCourse} />
        ) : (
          <View style={[ui.card, { marginBottom: 10 }]}>
            <Text style={{ color: ui.labelColor, fontSize: 13 }}>LETUSコース未突合（「コース収集」を実行してください）</Text>
          </View>
        )}
        <LinkAction
          icon="document-text-outline"
          title="シラバスを開く"
          onPress={() => navigation.navigate('Syllabus', { url: syllabusUrl, name })}
        />
        <LinkAction
          icon="create-outline"
          title="この科目の課題を追加"
          onPress={() =>
            // タブ（課題）→ネストのManualAssignmentへ横断遷移。親ナビゲータの型は緩いため最小I/Fにキャスト。
            (navigation.getParent() as unknown as { navigate: (name: string, params: object) => void } | undefined)?.navigate('課題', {
              screen: 'ManualAssignment',
              params: { presetCourseName: name, presetCourseCode: courseCode },
              // 課題タブ未訪問時に ManualAssignment がスタックのルート化して戻れなくなるのを防ぐ。
              // initial:false で AssignmentsHome を下に敷き、ヘッダ戻る＝取消を常に残す。
              initial: false,
            })
          }
        />
      </View>
    ),
    // 出欠: trackable→数値UI / 未収集→「未取得」案内 / 収集済み未記録・対象外→中立の「記録なし」。標準は折りたたみ。
    attendance: (
      <View style={{ marginTop: 12 }}>
        <LinkRow
          icon="checkmark-done-outline"
          title="出欠"
          sub={
            risk && risk.trackable
              ? risk.remaining > 0
                ? `あと${risk.remaining}回休める（欠席${risk.absent}/上限${risk.allowedAbsences}）`
                : '危険ライン到達'
              : !attCollected
                ? '未取得'
                : '記録なし'
          }
          onPress={() => navigation.navigate('SubjectSchedule', { courseCode, name, focus: 'attendance' })}
        />
      </View>
    ),
    // 実施パターン: 隔週・変則スケジュールの週別 実施/休み 編集。
    pattern: (
      <View style={{ marginTop: 12 }}>
        <LinkRow
          icon="repeat-outline"
          title="実施パターン"
          sub={pattern.off && Object.keys(pattern.off).length ? '隔週・変則あり' : '全週実施'}
          onPress={() => navigation.navigate('SubjectSchedule', { courseCode, name, focus: 'pattern' })}
        />
      </View>
    ),
  }

  return (
    <View style={styles.root}>
      {ui.colors.gradient ? <LinearGradient colors={ui.colors.gradient} style={StyleSheet.absoluteFill} /> : null}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: clearance }]}>
        <View style={[ui.card, styles.hero]}>
          <Text style={[styles.name, { color: ui.valueColor }]}>{name}</Text>
          <Text style={[styles.code, { color: ui.labelColor }]}>
            {courseCode}
            {day && period ? ` ・ ${day}曜${period}限` : ''}
          </Text>
          {room || (teachers && teachers[0]) ? (
            <View style={styles.chipRow}>
              {room ? <InfoChip icon="location-outline" label={isRemote ? `${room}・遠隔` : room} /> : null}
              {teachers && teachers[0] ? <InfoChip icon="person-outline" label={teachers[0]} /> : null}
            </View>
          ) : null}
          {unread > 0 ? (
            <View style={styles.chipRow}>
              <InfoChip icon="mail-unread-outline" label={`未読の掲示 ${unread}件`} />
            </View>
          ) : null}
        </View>

        <SubjectSummaryCard rows={summaryRows} />

        {subjectLayout
          .filter((s) => s.enabled)
          .map((s) => (
            <Fragment key={s.key}>{sectionNodes[s.key]}</Fragment>
          ))}

        {/* 半期（クォーター）指定: 積みコマ（同曜限2科目以上）に属する科目のみ表示。並べ替え対象外の固定セクション（YAGNI）。 */}
        {isStacked ? (
          <Accordion
            title="半期（クォーター）"
            icon="calendar-number-outline"
            subtitle={quarterPref === 'first' ? '前半' : quarterPref === 'second' ? '後半' : '通期'}
          >
            <Text style={[styles.patHint, { color: ui.labelColor, marginBottom: 8, marginTop: 0 }]}>
              同じ曜限にもう1科目ある半期科目です。この科目が前半／後半どちらの開講かを指定すると、時間割で「今の半期」に該当しない科目を薄く表示し、出席アラームの題名の科目名にも使います（CLASSは前半/後半を公開しないため手動指定）。
            </Text>
            <Segmented
              options={[
                { key: 'first', label: '前半' },
                { key: 'second', label: '後半' },
                { key: 'none', label: '通期' },
              ]}
              value={quarterPref ?? 'none'}
              onChange={(k) => {
                const next = k === 'none' ? undefined : (k as Quarter)
                setQuarterPref(next ?? null)
                saveTimetableOverride(courseCode, { quarter: next }).catch(() => undefined)
              }}
            />
          </Accordion>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 14, paddingBottom: 28 },
  hero: { marginBottom: 4 },
  name: { fontSize: 21, fontWeight: '700', lineHeight: 27 },
  code: { fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  linkIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 15, fontWeight: '500' },
  linkSub: { fontSize: 12, marginTop: 2 },
  // 更新状況（LETUS新着）カード。新着があるときだけ描画される。
  updatesCard: { marginTop: 12, gap: 6 },
  updatesHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updatesTitle: { flex: 1, fontSize: 15, fontWeight: '600', minWidth: 0 },
  updatesRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  updatesPlus: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  updatesText: { fontSize: 14, flex: 1 },
  updatesMore: { fontSize: 12 },
  updatesHint: { fontSize: 11, marginTop: 2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryText: { flex: 1, fontSize: 13, fontWeight: '500' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  addBtnText: { fontSize: 13, fontWeight: '600' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  eventText: { fontSize: 14, fontWeight: '600' },
  eventSub: { fontSize: 12, marginTop: 2 },
  makeupPill: { backgroundColor: COLORS.cta, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  makeupPillText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  // 出欠・実施パターンのUIは SubjectSchedule 画面へ移した（Task 4）。それに紐づく15件
  // （segRow/presetBtn/presetText/weekRow/weekLabel/weekPill/attSub/attSessionList/attSessionRow/
  // attSessionDate/attSessionMark/attStepper/attStepBtns/attStepBtn/attTotalNum）は、この画面から
  // 参照されなくなったので削除済み＝現在の定義は SubjectScheduleScreen.tsx 側にだけある
  // （写しを2箇所に残すと片方だけ腐る）。patRow/reanchor/attRow/attRemain の4件はそれ以前から
  // 死んでいたもので、どこにも定義は残っていない。
  patHint: { fontSize: 12, lineHeight: 18, marginTop: 10 },
})
