import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Dimensions, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Carousel, ScreenBg, ScreenHeader, SectionLabel, useUi, useTabBarClearance } from '../ui/screen'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { computeHomeBanner } from '../attendance/homeBanner'
import { pickFocusClass, type FocusClass } from '../home/focusClass'
import { formatDeadline, pickUrgentAssignment, relDue, TONE_COLOR, urgencyTone } from '../assignments/deadline'
import { loadAssignments } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import { loadClassEvents } from '../storage/classEventsStore'
import { todayEvents, todayKey } from '../timetableEvents/eventSelectors'
import { makeupOccurrences, type ClassEvent } from '../timetableEvents/classEvent'
import { eventTypeLabel } from '../timetableEvents/eventLabels'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import { loadBulletinDigest, loadBulletinDiag } from '../storage/bulletinDigestStore'
import { BUILD_TAG } from '../buildTag'
import { isManualUrl } from '../assignments/manualAssignment'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { isBulletinStale, loadBulletinRefreshedAt } from '../storage/refreshMetaStore'
import BulletinSyncEngine from '../collect/BulletinSyncEngine'
import { COLORS } from '../theme'

// 展開表示から端の小アイコンへ収縮するまでの時間。
const COLLAPSE_AFTER_MS = 5000

// 今日の予定タグの色（タイプ別）。
const EVENT_TONE: Record<string, string> = {
  cancel: '#e0533a', makeup: COLORS.cta, roomChange: '#e8a400', quiz: '#3a7be0', midterm: '#7a5cff', final: '#7a5cff', other: '#8a968f',
}

/**
 * ホーム画面。起点として「今やること」（次の授業＋直近の未提出課題）を最上部に集約し、続いて CLASS掲示、
 * 出席/インフォ/設定への導線を並べる。出席お知らせバナーは授業時間帯 or CLASS受付中に上部へ展開し、
 * 数秒後に右下の小ピルへ収縮する（判定は純粋ロジック、収縮アニメと遷移だけここで担う）。
 */
export default function HomeScreen() {
  const navigation = useNavigation<any>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { reception, timetable, now, running, attendedNow } = useAttendanceEngine()

  // 「今やること」用の現在時刻。engine停止中も分単位で更新して次の授業/締切を追随させる。
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [bulletin, setBulletin] = useState<BulletinItem[]>([])
  const [classEvents, setClassEvents] = useState<ClassEvent[]>([])
  const { version: classEventsVersion } = useClassEventsVersion()

  // CLASS掲示の裏取得中フラグ。true の間だけ headless エンジンをマウントする。
  const [bulletinSyncing, setBulletinSyncing] = useState(false)
  const bulletinSyncingRef = useRef(false)
  // 掲示収集の診断（着地ページ・件数）。取得できない原因の切り分け用に画面へ薄く表示する。
  const [bulletinDiag, setBulletinDiag] = useState('')

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadAssignments()
        .then((map) => active && setAssignments(Object.values(map)))
        .catch(() => undefined)
      loadBulletinDigest()
        .then((b) => active && setBulletin(b))
        .catch(() => undefined)
      loadBulletinDiag()
        .then((d) => active && setBulletinDiag(d))
        .catch(() => undefined)
      loadClassEvents()
        .then((e) => active && setClassEvents(e))
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, []),
  )

  useEffect(() => {
    loadClassEvents().then(setClassEvents).catch(() => undefined)
  }, [classEventsVersion])

  // 掲示の裏取得を開始する。force=false ならスロットル（前回更新から時間が経っている時だけ）。
  const startBulletinSync = useCallback((force: boolean) => {
    if (bulletinSyncingRef.current) return
    const begin = () => {
      bulletinSyncingRef.current = true
      setBulletinSyncing(true)
    }
    if (force) {
      begin()
      return
    }
    loadBulletinRefreshedAt()
      .then((at) => {
        if (!bulletinSyncingRef.current && isBulletinStale(at)) begin()
      })
      .catch(() => undefined)
  }, [])

  // エンジン停止中は reception が陳腐化するため信頼しない（授業時間帯の時間割判定のみに委ねる）。
  // 出席済みのときは「出席登録受付中/出席を確認」バナーは出さない（案内が不要・紛らわしい）。
  const rawBanner = computeHomeBanner(timetable, running ? reception : null, now)
  const banner = attendedNow ? { ...rawBanner, active: false } : rawBanner

  const focus = pickFocusClass(timetable, tick)
  const urgent = pickUrgentAssignment(assignments, tick)
  // ストアは全件（既読・フラグ付き含む）を持つため、ホームの「未読」スライドは未読のみに絞る。
  const unreadBulletin = bulletin.filter((b) => b.unread)

  // 今日の予定（当日のイベント＋当日の補講オカレンス）。
  const todaysItems: { tag: string; tone: string; course: string; sub: string }[] = []
  for (const e of todayEvents(classEvents, tick)) {
    const extra = e.type === 'roomChange' && e.room ? ` → ${e.room}` : ''
    todaysItems.push({
      tag: eventTypeLabel(e.type),
      tone: EVENT_TONE[e.type] ?? '#8a968f',
      course: e.courseName,
      sub: `${e.periods.join('・')}限${extra}${e.note ? ` ・ ${e.note}` : ''}`,
    })
  }
  const tkey = todayKey(tick)
  for (const m of makeupOccurrences(classEvents)) {
    if (m.date !== tkey) continue
    todaysItems.push({ tag: '補講', tone: COLORS.cta, course: m.courseName, sub: `${m.periods.join('・')}限${m.room ? ` ・ ${m.room}` : ''}` })
  }

  const [expanded, setExpanded] = useState(true)
  // バナーがマウント中か（引っ込むアニメの間は残し、終わってから外す）。
  const [bannerMounted, setBannerMounted] = useState(true)
  // bannerAnim: 0=上へ引っ込んだ / 1=展開表示。pillAnim: 0=右上に隠れ / 1=右下ボタンとして着地。
  const bannerAnim = useRef(new Animated.Value(0)).current
  const pillAnim = useRef(new Animated.Value(0)).current
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 「新しい受付状態」への切り替わりを検知する署名（種別＋科目名）。変化時だけ再展開する。
  const sigRef = useRef<string>('')

  useEffect(() => {
    const sig = banner.active ? `${banner.kind}:${banner.courseName ?? ''}` : ''
    if (sig && sig !== sigRef.current) {
      // 新たに条件が真化 or 別の授業/受付に切り替わった → 展開して5秒後に収縮。
      setExpanded(true)
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
      collapseTimer.current = setTimeout(() => setExpanded(false), COLLAPSE_AFTER_MS)
    }
    sigRef.current = sig
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
    }
  }, [banner.active, banner.kind, banner.courseName])

  // 展開⇄収縮アニメ: 収縮時はバナーを上へ引っ込め→ピルが右端を伝って右下へ移動し端から現れる。
  useEffect(() => {
    if (!banner.active) return
    if (expanded) {
      setBannerMounted(true)
      Animated.parallel([
        Animated.timing(pillAnim, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(bannerAnim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start()
    } else {
      // 1) バナーがゆっくり上へ引っ込む → 2) 短い線が右端を伝って降りる → 3) 最後に水滴が弾けて円になる。
      Animated.timing(bannerAnim, { toValue: 0, duration: 360, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setBannerMounted(false)
        },
      )
      Animated.timing(pillAnim, { toValue: 1, duration: 1150, delay: 220, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start()
    }
  }, [expanded, banner.active, bannerAnim, pillAnim])

  function openAttendance() {
    navigation.navigate('Attendance')
  }
  function openBulletin() {
    navigation.navigate('Bulletin')
  }
  // 「今やること」の課題カードから、その課題の詳細（課題タブ内）へ直接飛ぶ。
  function openAssignment(url: string) {
    const screen = isManualUrl(url) ? 'ManualAssignment' : 'LetusAssignmentDetail'
    navigation.navigate('課題', { screen, params: { url } })
  }

  const accent = banner.kind === 'accepting' ? COLORS.cta : COLORS.emerald
  const tone = urgent ? urgencyTone(urgent, tick) : 'green'
  const toneColor = TONE_COLOR[tone]
  // ピルが右上から右下へ「右端を伝って」降りてくる移動距離。
  const pillTravel = Math.min(Dimensions.get('window').height * 0.55, 460)

  return (
    <View style={styles.wrap}>
      <ScreenBg>
        <ScreenHeader title="ホーム" icon="home-outline" />
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: clearance }]}>
          {/* 開発ビルドの識別タグ（APK名 litus-...-vNN と一致）。公開前に撤去する。 */}
          <Text style={[styles.devTag, { color: ui.labelColor }]}>{BUILD_TAG}</Text>
          {banner.active && bannerMounted ? (
            <Animated.View
              style={{
                opacity: bannerAnim,
                transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) }],
              }}
            >
              <Pressable
                style={[styles.banner, { backgroundColor: accent }]}
                onPress={openAttendance}
                accessibilityRole="button"
              >
                <View style={styles.bannerDot}>
                  <Ionicons name="flash" size={18} color="#ffffff" />
                </View>
                <View style={styles.bannerBody}>
                  <Text style={styles.bannerTitle} numberOfLines={2}>
                    {banner.text}
                  </Text>
                  <Text style={styles.bannerSub}>タップで出席へ</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ffffff" />
              </Pressable>
            </Animated.View>
          ) : null}

          {/* 今やること: 次の授業＋直近の未提出課題。どちらも無ければセクションごと隠す。 */}
          {focus || urgent ? (
            <>
              <SectionLabel>今やること</SectionLabel>
              <View style={[ui.card, styles.focusCard]}>
                {focus ? <FocusClassRow focus={focus} ui={ui} last={!urgent} /> : null}
                {focus && urgent ? <View style={[styles.focusDivider, { backgroundColor: ui.dividerColor }]} /> : null}
                {urgent ? (
                  <Pressable style={styles.focusRow} onPress={() => openAssignment(urgent.url)}>
                    <View style={styles.focusLead}>
                      <View style={[styles.focusDot, { backgroundColor: toneColor }]} />
                    </View>
                    <View style={styles.focusMain}>
                      <Text style={[styles.focusTitle, { color: ui.valueColor }]} numberOfLines={1}>
                        {urgent.title}
                      </Text>
                      <Text style={[styles.focusSub, { color: ui.labelColor }]} numberOfLines={1}>
                        {urgent.courseName || '科目不明'} ・ 迫る締切
                      </Text>
                    </View>
                    <View style={styles.focusRight}>
                      <Text style={[styles.focusRel, { color: ui.green ? '#ffffff' : toneColor }]}>
                        {relDue(urgent.deadline, tick)}
                      </Text>
                      <Text style={[styles.focusDue, { color: ui.green ? '#eafff7' : '#8a968f' }]}>
                        {formatDeadline(urgent.deadline)}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}

          {/* 今日の予定: 休講/補講/教室変更/小テスト/中間/期末など当日分。無ければ節ごと非表示。 */}
          {todaysItems.length > 0 ? (
            <>
              <SectionLabel>今日の予定</SectionLabel>
              <View style={[ui.card, { gap: 8 }]}>
                {todaysItems.map((it, i) => (
                  <View key={`te-${i}`} style={styles.todayEvRow}>
                    <View style={[styles.todayEvTag, { backgroundColor: it.tone }]}>
                      <Text style={styles.todayEvTagText}>{it.tag}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.todayEvTitle, { color: ui.valueColor }]} numberOfLines={1}>{it.course}</Text>
                      <Text style={[styles.todayEvSub, { color: ui.labelColor }]} numberOfLines={1}>{it.sub}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* CLASS掲示（インフォから移設）。未読ダイジェストが埋まっていればスライド、空ならCTA。 */}
          <View style={styles.bulletinSectionRow}>
            <SectionLabel>CLASS掲示</SectionLabel>
            <Pressable onPress={() => startBulletinSync(true)} hitSlop={10} disabled={bulletinSyncing} style={styles.refreshBtn}>
              {bulletinSyncing ? (
                <ActivityIndicator size="small" color={ui.green ? '#eafff7' : COLORS.emerald} />
              ) : (
                <Ionicons name="refresh" size={16} color={ui.green ? '#eafff7' : COLORS.emerald} />
              )}
            </Pressable>
          </View>
          {unreadBulletin.length > 0 ? (
            <View style={[ui.card, styles.bulletinCard]}>
              <View style={styles.bulletinHead}>
                <Ionicons name="megaphone-outline" size={18} color={ui.green ? '#ffffff' : COLORS.emerald} />
                <Text style={[styles.bulletinHeadText, { color: ui.valueColor }]}>CLASS掲示</Text>
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>未読 {unreadBulletin.length}</Text>
                </View>
              </View>
              <Carousel
                intervalMs={3500}
                items={unreadBulletin.map((b) => (
                  <Pressable key={b.id} onPress={openBulletin} style={styles.bulletinSlide}>
                    <View style={[styles.bulletinTag, { backgroundColor: ui.green ? 'rgba(255,255,255,0.5)' : '#d6efe4' }]}>
                      <Text style={[styles.bulletinTagText, { color: ui.green ? '#04322a' : COLORS.emeraldDark }]}>
                        {b.category}
                      </Text>
                    </View>
                    <Text style={[styles.bulletinTitle, { color: ui.valueColor }]} numberOfLines={2}>
                      {b.title}
                    </Text>
                    <Text style={[styles.bulletinMeta, { color: ui.labelColor }]}>{b.meta}</Text>
                  </Pressable>
                ))}
              />
              <Pressable onPress={openBulletin}>
                <Text style={[styles.bulletinMore, { color: ui.green ? '#eafff7' : COLORS.emerald }]}>すべて見る ↗</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={[ui.card, styles.bulletinCta]} onPress={() => startBulletinSync(true)}>
              <Ionicons name="megaphone-outline" size={20} color={COLORS.emerald} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bulletinCtaText, { color: ui.valueColor }]}>
                  {bulletinSyncing ? '掲示を取得しています…' : 'まだ取得できていません。タップで取得します。'}
                </Text>
                {bulletinDiag ? (
                  <Text style={{ color: ui.labelColor, fontSize: 10, marginTop: 4 }}>診断: {bulletinDiag}</Text>
                ) : null}
              </View>
            </Pressable>
          )}

          <SectionLabel>その他</SectionLabel>
          <Pressable style={[ui.card, styles.entry]} onPress={openAttendance}>
            <View style={[styles.entryIcon, { backgroundColor: ui.green ? 'rgba(255,255,255,0.5)' : '#d6efe4' }]}>
              <Ionicons name="flash-outline" size={20} color={COLORS.emerald} />
            </View>
            <View style={styles.entryBody}>
              <Text style={[styles.entryTitle, { color: ui.valueColor }]}>出席登録</Text>
              <Text style={[styles.entrySub, { color: ui.labelColor }]}>
                {banner.active ? banner.text : 'CLASSの出席コードを入力'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9bb3ab" />
          </Pressable>
          <Pressable style={[ui.card, styles.entry]} onPress={() => navigation.navigate('Info')}>
            <View style={[styles.entryIcon, { backgroundColor: ui.green ? 'rgba(255,255,255,0.5)' : '#d6efe4' }]}>
              <Ionicons name="newspaper-outline" size={20} color={COLORS.emerald} />
            </View>
            <View style={styles.entryBody}>
              <Text style={[styles.entryTitle, { color: ui.valueColor }]}>インフォ</Text>
              <Text style={[styles.entrySub, { color: ui.labelColor }]}>学食・キャンパス情報</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9bb3ab" />
          </Pressable>
          <Pressable style={[ui.card, styles.entry]} onPress={() => navigation.navigate('Settings')}>
            <View style={[styles.entryIcon, { backgroundColor: ui.green ? 'rgba(255,255,255,0.5)' : '#d6efe4' }]}>
              <Ionicons name="settings-outline" size={20} color={COLORS.emerald} />
            </View>
            <View style={styles.entryBody}>
              <Text style={[styles.entryTitle, { color: ui.valueColor }]}>設定</Text>
              <Text style={[styles.entrySub, { color: ui.labelColor }]}>テーマ・出席アラーム・表示</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9bb3ab" />
          </Pressable>
        </ScrollView>
      </ScreenBg>

      {/* 収縮アニメ: バナーが引っ込んだ後、短い線が右端を伝って降り、最後に水滴が弾けて円ボタンになる。 */}
      {banner.active ? (
        <>
          {/* 右端を伝う短い線。 */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.edgeLine,
              {
                backgroundColor: accent,
                bottom: clearance - 8 + 12,
                opacity: pillAnim.interpolate({ inputRange: [0, 0.08, 0.6, 0.72], outputRange: [0, 1, 1, 0] }),
                transform: [
                  {
                    translateY: pillAnim.interpolate({
                      inputRange: [0.08, 0.68],
                      outputRange: [-pillTravel, 0],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          />
          {/* 水滴が弾けてできる円ボタン（少しオーバーシュートしてから収まる）。 */}
          <Animated.View
            pointerEvents={expanded ? 'none' : 'auto'}
            style={[
              styles.miniPill,
              {
                backgroundColor: accent,
                bottom: clearance - 8,
                opacity: pillAnim.interpolate({ inputRange: [0.64, 0.74], outputRange: [0, 1], extrapolate: 'clamp' }),
                transform: [
                  { scale: pillAnim.interpolate({ inputRange: [0.64, 0.86, 1], outputRange: [0.2, 1.18, 1], extrapolate: 'clamp' }) },
                ],
              },
            ]}
          >
            <Pressable onPress={openAttendance} accessibilityLabel={banner.text} style={styles.miniPillHit}>
              <Ionicons name="flash" size={16} color="#ffffff" />
            </Pressable>
          </Animated.View>
        </>
      ) : null}

      {bulletinSyncing ? (
        <BulletinSyncEngine
          onFinished={() => {
            bulletinSyncingRef.current = false
            setBulletinSyncing(false)
            loadBulletinDigest().then(setBulletin).catch(() => undefined)
            loadBulletinDiag().then(setBulletinDiag).catch(() => undefined)
          }}
        />
      ) : null}
    </View>
  )
}

/** 「今やること」の授業行（時限・時刻＋科目＋今の授業/次の授業バッジ）。 */
function FocusClassRow({ focus, ui, last }: { focus: FocusClass; ui: ReturnType<typeof useUi>; last: boolean }) {
  return (
    <View style={[styles.focusRow, last && { paddingBottom: 14 }]}>
      <View style={styles.focusLead}>
        <Text style={[styles.focusPer, { color: ui.labelColor }]} numberOfLines={1}>{focus.period}限</Text>
        <Text style={[styles.focusTime, { color: ui.valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
          {focus.start}
        </Text>
      </View>
      <View style={[styles.focusTimeDivider, { backgroundColor: ui.dividerColor }]} />
      <View style={styles.focusMain}>
        <View style={styles.focusTitleRow}>
          <Text style={[styles.focusTitle, { color: ui.valueColor }]} numberOfLines={1}>
            {focus.name}
          </Text>
          <View style={[styles.nextBadge, { backgroundColor: ui.green ? 'rgba(255,255,255,0.6)' : '#e3f5ee' }]}>
            <Text style={[styles.nextBadgeText, { color: ui.green ? '#053a2c' : COLORS.cta }]}>
              {focus.isNow ? '今の授業' : '次の授業'}
            </Text>
          </View>
        </View>
        <Text style={[styles.focusSub, { color: ui.labelColor }]} numberOfLines={1}>
          {focus.room}
          {focus.isRemote ? ' ・ 遠隔' : ''}
          {focus.teachers[0] ? ` ・ ${focus.teachers[0]}` : ''}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { paddingBottom: 24 },
  devTag: { alignSelf: 'flex-end', fontSize: 11, fontWeight: '700', opacity: 0.7, marginBottom: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    padding: 14,
    marginTop: 6,
    marginBottom: 10,
    shadowColor: '#0a6650',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bannerDot: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  bannerBody: { flex: 1 },
  bannerTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700', lineHeight: 20 },
  bannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },

  focusCard: { paddingVertical: 4, paddingHorizontal: 16 },
  focusRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  focusLead: { width: 58, alignItems: 'center', justifyContent: 'center' },
  focusPer: { fontSize: 11 },
  focusTime: { fontSize: 18, fontWeight: '700', lineHeight: 20, marginTop: 1 },
  focusTimeDivider: { width: 1, alignSelf: 'stretch' },
  focusDivider: { height: 1 },
  focusMain: { flex: 1, minWidth: 0 },
  focusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  focusTitle: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  focusSub: { fontSize: 12, marginTop: 3 },
  nextBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  nextBadgeText: { fontSize: 10, fontWeight: '700' },
  focusDot: { width: 10, height: 10, borderRadius: 5 },
  focusRight: { alignItems: 'flex-end' },
  focusRel: { fontSize: 15, fontWeight: '700' },
  focusDue: { fontSize: 11, marginTop: 1 },

  bulletinSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn: { padding: 6, marginTop: 8 },
  bulletinCard: { paddingBottom: 12 },
  bulletinHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bulletinHeadText: { fontSize: 15, fontWeight: '600', flex: 1 },
  unreadBadge: { backgroundColor: COLORS.cta, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  unreadBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  bulletinSlide: { minHeight: 76 },
  bulletinTag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  bulletinTagText: { fontSize: 10, fontWeight: '700' },
  bulletinTitle: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  bulletinMeta: { fontSize: 11, marginTop: 5 },
  bulletinMore: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  bulletinCta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletinCtaText: { flex: 1, fontSize: 15, fontWeight: '500' },

  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  entryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  entryBody: { flex: 1 },
  entryTitle: { fontSize: 15, fontWeight: '600' },
  entrySub: { fontSize: 12, marginTop: 2 },
  todayEvRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todayEvTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, minWidth: 52, alignItems: 'center' },
  todayEvTagText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  todayEvTitle: { fontSize: 14, fontWeight: '600' },
  todayEvSub: { fontSize: 12, marginTop: 1 },
  edgeLine: { position: 'absolute', right: 4, width: 4, height: 26, borderRadius: 2 },
  miniPillHit: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  miniPill: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0a6650',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
})
