// app/src/screens/SubjectDetailScreen.tsx
import { cloneElement, Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SectionLabel, useUi, useTabBarClearance } from '../ui/screen'
import { Accordion } from '../ui/Accordion'
import { resolveNextSession, pickAttentionEvent, type NextSession } from '../timetableEvents/nextSession'
import { COLORS } from '../theme'
import type { TimetableStackParamList } from '../navigation/types'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadCourseNews, mutateCourseNews } from '../storage/courseNewsStore'
import { markCourseSeen, type CourseNewsItem } from '../updates/courseNews'
import { buildSyllabusUrl } from '../links/syllabus'
import { useDisplaySettings } from '../displaySettings'
import type { SubjectSectionKey } from '../subject/subjectSections'
import { loadClassEvents, upsertClassEvent } from '../storage/classEventsStore'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { cellBadgeText } from '../timetableEvents/eventLabels'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import { useBulletinEventCandidates } from '../timetableEvents/useBulletinEventCandidates'
import { candidateToClassEvent, type CandidateView } from '../timetableEvents/bulletinEvents'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { loadWeeklyPatterns, saveWeeklyPattern } from '../storage/weeklyPatternStore'
import {
  mondayOf,
  weekMondayKey,
  isWeekOff,
  toggleWeek,
  applyBiweeklyPreset,
  clearPattern,
  weekList,
  type WeeklyPattern,
} from '../timetableEvents/weeklyPattern'
import { loadAttendanceStats } from '../storage/attendanceStatsStore'
import type { AttendanceMark } from '../parsers/attendanceStats'
import { loadAttendanceOverrides, saveAttendanceOverride } from '../storage/attendanceOverridesStore'
import { computeAttendanceRisk, type AttendanceRisk } from '../attendance/attendanceRisk'
import { useAttendanceVersion } from '../attendance/attendanceVersion'
import { resolveTermDates, termWeeksFromSessions, deriveExcludedDates } from '../attendance/attendanceTerm'
import type { AttendanceCourseStats } from '../parsers/attendanceStats'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import { courseUnreadCounts } from '../timetableEvents/courseUnread'

type IconName = keyof typeof Ionicons.glyphMap

// 各回リストの区分表示（CLASS凡例の記号＋文言。色単独禁止＝欠席の赤にも×と文言を必ず併記）。
const MARK_LABEL: Record<AttendanceMark, string> = {
  present: '〇 出席',
  absent: '× 欠席',
  late: '△ 遅刻',
  earlyLeave: '▽ 早退',
  official: '公欠',
  canceled: '休講',
  notInScope: '対象外',
  examNotInScope: '試験対象外',
  none: '未記録',
}

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
  const [attStats, setAttStats] = useState<AttendanceCourseStats | null>(null)
  const [attTotal, setAttTotal] = useState<number | null>(null)
  // 出欠データを一度でも収集済みか。未収集だと trackable 判定すらできず従来はセクション自体が消えて
  // 「機能が存在しないように見える」ため、未収集時は案内を出す（初期値trueで案内のチラつきを防ぐ）。
  const [attCollected, setAttCollected] = useState(true)
  // 出欠収集の完了通知（この画面を開いたまま同期が完走したら再読込するため版数を購読）。
  const { version: attVersion } = useAttendanceVersion()
  const [unread, setUnread] = useState(0)
  // 出欠の各回日付を実日付へ解決（隔週の非実施週除外・実施パターンの週リスト生成に使う）。
  const resolvedSessions = useMemo(
    () => resolveTermDates(attStats?.sessions ?? [], new Date()),
    [attStats],
  )
  // 実施パターン編集の週リスト。出欠データがある科目は全学期週（過去〜将来）、無い科目は従来の近未来範囲。
  const weeks = useMemo(() => {
    const tw = termWeeksFromSessions(resolvedSessions)
    return tw.length ? tw : weekList(new Date(), 2, 16)
  }, [resolvedSessions])
  const thisKey = weekMondayKey(new Date())

  const syllabusUrl = buildSyllabusUrl(courseCode, new Date())

  useEffect(() => {
    loadWeeklyPatterns()
      .then((m) => setPattern(m[courseCode] ?? {}))
      .catch(() => undefined)
  }, [courseCode])

  const updatePattern = (next: WeeklyPattern) => {
    setPattern(next)
    saveWeeklyPattern(courseCode, next).catch(() => undefined)
  }

  useEffect(() => {
    ;(async () => {
      const data = await loadAttendanceStats()
      setAttCollected(data !== null)
      const found = data?.courses.find((c) => c.courseCode === courseCode) ?? null
      setAttStats(found)
      const ov = await loadAttendanceOverrides()
      setAttTotal(ov[courseCode]?.total ?? null)
    })().catch(() => undefined)
  }, [courseCode, attVersion])

  // 実施パターンで「休み」にした週の回を分子(欠席)・分母(総回数)の両方から除外する。
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

  const changeTotal = (delta: number) => {
    const base = attTotal ?? risk?.scheduledTotal ?? 0
    const next = Math.max(0, base + delta)
    setAttTotal(next)
    saveAttendanceOverride(courseCode, { total: next }).catch(() => undefined)
  }

  useEffect(() => {
    ;(async () => {
      const map = await loadCourseMap()
      const course = map[courseCode] ?? null
      setLetusUrl(course?.url ?? null)
      if (course) {
        const newsMap = await loadCourseNews()
        setNews(newsMap[course.url]?.items ?? [])
      }
    })()
  }, [courseCode])

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
        subtitle={attention ? `直近: ${Number(attention.date.split('-')[1])}/${Number(attention.date.split('-')[2])} ${attention.type === 'cancel' ? '休講' : '教室変更'}` : events.length ? `${events.length}件` : undefined}
        right={
          attention && attention.type === 'cancel' && attention.makeupStatus === 'undecided' ? (
            <View style={styles.makeupPill}>
              <Text style={styles.makeupPillText}>要対応</Text>
            </View>
          ) : undefined
        }
      >
        <View style={styles.eventsHead}>
          <Text style={{ color: ui.labelColor, fontSize: 12 }}>休講・補講・教室変更・小テスト等</Text>
          <Pressable
            style={[styles.addBtn, { backgroundColor: ui.softBoxBg }]}
            onPress={() => navigation.navigate('ClassEventForm', { courseName: name, courseCode, dayKey })}
          >
            <Ionicons name="add" size={16} color={ui.accent} />
            <Text style={[styles.addBtnText, { color: ui.accent }]}>予定を追加</Text>
          </Pressable>
        </View>
        {candidates.map((v) => (
          <View key={`cand-${v.candidate.sourceBulletinId}`} style={[ui.card, styles.candRow]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.candHead}>
                <View style={[styles.candTag, { backgroundColor: ui.pillBg }]}>
                  <Text style={[styles.candTagText, { color: ui.pillText }]}>掲示より</Text>
                </View>
                <Text style={[styles.eventText, { color: ui.valueColor }]} numberOfLines={1}>
                  {cellBadgeText(candidateToClassEvent(v.candidate, v.candidate.sourceBulletinId))}
                </Text>
              </View>
              <Text style={[styles.eventSub, { color: ui.labelColor }]}>
                {v.candidate.date} ・ {v.candidate.periods.join('・')}限
                {v.candidate.makeup ? ` ・ 補講 ${v.candidate.makeup.date}` : ''}
              </Text>
            </View>
            {v.state === 'added' ? (
              <Text style={[styles.candDone, { color: ui.labelColor }]}>追加済み</Text>
            ) : v.state === 'makeupAppend' ? (
              <Pressable style={styles.candBtn} onPress={() => appendMakeup(v)}>
                <Text style={styles.candBtnText}>補講を追記</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.candBtn} onPress={() => addCandidate(v)}>
                <Text style={styles.candBtnText}>追加</Text>
              </Pressable>
            )}
          </View>
        ))}
        {events.length === 0 ? (
          <Text style={{ color: ui.labelColor, fontSize: 13, marginTop: 8 }}>
            休講・補講・教室変更・小テスト・中間・期末などを登録できます。
          </Text>
        ) : (
          events.map((e) => (
            <Pressable
              key={e.id}
              style={[ui.card, styles.eventRow]}
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
          ))
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
    // リンク: LETUS/シラバス/課題追加＋コース更新チェック（旧「更新状況」アコーディオンから導線を退避。
    // UpdateCheck ルートへの唯一の導線なので消さない＝死に導線防止）。
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
        <LinkAction
          icon="refresh-outline"
          title="コース更新をチェック"
          onPress={() => navigation.navigate('UpdateCheck')}
        />
      </View>
    ),
    // 出欠: trackable→数値UI / 未収集→「未取得」案内 / 収集済み未記録・対象外→中立の「記録なし」。標準は折りたたみ。
    attendance:
      risk && risk.trackable ? (
        <Accordion
          title="出欠"
          icon="checkmark-done-outline"
          subtitle={risk.remaining > 0 ? `あと${risk.remaining}回休める（欠席${risk.absent}/上限${risk.allowedAbsences}）` : '危険ライン到達'}
        >
          <Text style={[styles.attSub, { color: ui.labelColor }]}>
            欠席{risk.absent} / 上限{risk.allowedAbsences}（全{risk.scheduledTotal}回）
          </Text>
          <Text style={[styles.attSub, { color: ui.labelColor, marginTop: 6 }]}>
            出席{risk.attended}・欠席{risk.absent}
            {risk.late ? `・遅刻${risk.late}` : ''}
            {risk.earlyLeave ? `・早退${risk.earlyLeave}` : ''}
            {risk.official ? `・公欠${risk.official}` : ''}
            {risk.canceled ? `・休講${risk.canceled}` : ''}
          </Text>
          {attStats && attStats.sessions.some((s) => s.date) ? (
            // 各回の出欠（フラット行＋区切り線・高密度面）。実施パターンで休みにした週の回は「休み週」表示。
            <View style={[styles.attSessionList, { borderTopColor: ui.dividerColor }]}>
              {attStats.sessions
                .filter((s) => s.date)
                .map((s, i) => {
                  const excluded = excludeDates.includes(s.date as string)
                  const markColor = excluded
                    ? ui.labelColor
                    : s.mark === 'absent'
                      ? ui.colors.danger
                      : s.mark === 'none'
                        ? ui.labelColor
                        : ui.valueColor
                  return (
                    <View key={`${s.date}-${i}`} style={[styles.attSessionRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor }]}>
                      <Text style={[styles.attSessionDate, { color: excluded ? ui.labelColor : ui.valueColor }]}>
                        第{i + 1}回 ・ {s.date}
                      </Text>
                      <Text style={[styles.attSessionMark, { color: markColor }]}>
                        {excluded ? '休み週・除外' : MARK_LABEL[s.mark]}
                      </Text>
                    </View>
                  )
                })}
            </View>
          ) : null}
          <View style={[styles.attStepper, { borderTopColor: ui.dividerColor }]}>
            <Text style={[styles.attSub, { color: ui.labelColor }]}>総回数（隔週などで手動調整）</Text>
            <View style={styles.attStepBtns}>
              <Pressable style={[styles.attStepBtn, { backgroundColor: ui.softBoxBg }]} onPress={() => changeTotal(-1)}>
                <Ionicons name="remove" size={16} color={ui.accentSoft} />
              </Pressable>
              <Text style={[styles.attTotalNum, { color: ui.valueColor }]}>{attTotal ?? risk.scheduledTotal}</Text>
              <Pressable style={[styles.attStepBtn, { backgroundColor: ui.softBoxBg }]} onPress={() => changeTotal(1)}>
                <Ionicons name="add" size={16} color={ui.accentSoft} />
              </Pressable>
            </View>
          </View>
        </Accordion>
      ) : !attCollected ? (
        // 未収集: まだ一度も収集していない → 取得方法を案内する。
        <Accordion title="出欠" icon="checkmark-done-outline" subtitle="未取得">
          <Text style={[styles.attSub, { color: ui.labelColor }]}>
            出欠データはまだ取得できていません。時間割タブで下に引いて同期すると、CLASSの「学生出欠状況確認」から自動で取得します。
          </Text>
        </Accordion>
      ) : (
        // 収集済みだが当該科目に出欠データが無い（未記録／出席管理対象外／集中講義等でCLASS出欠に載らない）。
        // 0マーク科目に「あと◯回休める」を出すと誤情報になるため数値UIは出さず、中立の「記録なし」案内にする。
        // これで学期序盤の全科目未記録でも機能が消えて見えず、収集失敗（=未取得）とも区別できる。
        <Accordion title="出欠" icon="checkmark-done-outline" subtitle="記録なし">
          <Text style={[styles.attSub, { color: ui.labelColor }]}>
            この科目はまだCLASS出欠の記録がありません。担当教員がCLASSで出欠を取らない科目や、学期序盤で記録がない場合は数字が表示されません。
          </Text>
        </Accordion>
      ),
    // 実施パターン: 隔週・変則スケジュールの週別 実施/休み 編集。
    pattern: (
      <Accordion
        title="実施パターン"
        icon="repeat-outline"
        subtitle={pattern.off && Object.keys(pattern.off).length ? '隔週・変則あり' : '全週実施'}
      >
        <Text style={[styles.patHint, { color: ui.labelColor, marginBottom: 8, marginTop: 0 }]}>
          実施する週を選びます。既定は全週実施。隔週は「プリセット」で入れて、ずれた週だけタップで切り替えてください。
        </Text>
        <View style={styles.segRow}>
          <Pressable style={[styles.presetBtn, { backgroundColor: ui.softBoxBg }]} onPress={() => updatePattern(applyBiweeklyPreset(mondayOf(new Date()), weeks))}>
            <Ionicons name="repeat-outline" size={15} color={ui.accentSoft} />
            <Text style={[styles.presetText, { color: ui.accentSoft }]}>隔週プリセット</Text>
          </Pressable>
          <Pressable style={[styles.presetBtn, { backgroundColor: ui.softBoxBg }]} onPress={() => updatePattern(clearPattern())}>
            <Ionicons name="checkmark-done-outline" size={15} color={ui.accentSoft} />
            <Text style={[styles.presetText, { color: ui.accentSoft }]}>全週実施に戻す</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 8 }}>
          {weeks.map((w) => {
            const off = isWeekOff(pattern, w)
            const isThis = weekMondayKey(w) === thisKey
            return (
              <Pressable
                key={weekMondayKey(w)}
                onPress={() => updatePattern(toggleWeek(pattern, w))}
                style={[styles.weekRow, { borderBottomColor: ui.dividerColor }]}
              >
                <Text style={[styles.weekLabel, { color: off ? ui.labelColor : ui.valueColor, fontWeight: isThis ? '800' : '500' }]}>
                  {w.getMonth() + 1}/{w.getDate()} の週{isThis ? ' ・ 今週' : ''}
                </Text>
                <View style={[styles.weekPill, { backgroundColor: off ? ui.colors.patternOffBg : ui.pillBg }]}>
                  <Text style={{ color: off ? ui.colors.patternOffText : ui.pillText, fontSize: 12, fontWeight: '700' }}>
                    {off ? '休み' : '実施'}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      </Accordion>
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
  eventsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  addBtnText: { fontSize: 13, fontWeight: '600' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  eventText: { fontSize: 14, fontWeight: '600' },
  eventSub: { fontSize: 12, marginTop: 2 },
  candRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.emerald },
  candHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  candTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  candTagText: { fontSize: 10, fontWeight: '800' },
  candDone: { fontSize: 12, fontWeight: '700' },
  candBtn: { backgroundColor: COLORS.emerald, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  candBtnText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  makeupPill: { backgroundColor: COLORS.cta, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  makeupPillText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  segRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 12,
  },
  presetText: { fontSize: 12.5, fontWeight: '700' },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekLabel: { fontSize: 14 },
  weekPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, minWidth: 52, alignItems: 'center' },
  patRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  reanchor: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  patHint: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  attRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  attRemain: { fontSize: 17, fontWeight: '800' },
  attSub: { fontSize: 12.5 },
  attSessionList: { marginTop: 10, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  attSessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  attSessionDate: { fontSize: 13 },
  attSessionMark: { fontSize: 13, fontWeight: '600' },
  attStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  attStepBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attStepBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  attTotalNum: { fontSize: 16, fontWeight: '700', minWidth: 28, textAlign: 'center' },
})
