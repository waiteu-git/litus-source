import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
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
import { todaySchedule, type TodayScheduleItem } from '../timetableEvents/eventSelectors'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { eventTypeLabel } from '../timetableEvents/eventLabels'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import { loadBulletinDigest, loadBulletinDiag } from '../storage/bulletinDigestStore'
import { BUILD_TAG } from '../buildTag'
import { isManualUrl } from '../assignments/manualAssignment'
import { NowPulse } from '../ui/NowPulse'
import { loadWeeklyPatterns } from '../storage/weeklyPatternStore'
import type { WeeklyPatternMap } from '../storage/weeklyPatternSerialize'
import { isClassOnDate } from '../timetableEvents/weeklyPattern'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { isBulletinStale, loadBulletinRefreshedAt } from '../storage/refreshMetaStore'
import { loadCollectionHealth } from '../storage/collectionHealthStore'
import type { StoredHealth } from '../storage/collectionHealthSerialize'
import HealthBanner from '../ui/HealthBanner'
import FreshnessLabel from '../ui/FreshnessLabel'
import { evaluateAccess } from '../health/accessGate'
import { isOnlineNow } from '../health/connectivity'
import { bulletinSyncSkipMessage, bulletinSyncSkipReason } from '../home/bulletinSyncNotice'
import BulletinSyncEngine from '../collect/BulletinSyncEngine'
import { COLORS, DARK } from '../theme'
import { DUR, EASE, SHIFT, SPRING } from '../ui/motion'

// 展開表示から端の小アイコンへ収縮するまでの時間。
const COLLAPSE_AFTER_MS = 5000

// 手動更新をガードでスキップした理由テキストを出しておく時間。
const SYNC_NOTICE_MS = 5000

// 今日の予定タグの色（タイプ別）。
const EVENT_TONE: Record<string, string> = {
  cancel: '#e0533a', makeup: COLORS.cta, roomChange: '#e8a400', quiz: '#3a7be0', midterm: '#7a5cff', final: '#7a5cff', other: '#8a968f',
}

/** 今日の予定1件のサブ行（時限＋教室/補足）。教室変更は「→ 教室」、それ以外は「・ 教室」で付す。 */
function eventSubText(it: TodayScheduleItem): string {
  const base = `${it.periods.join('・')}限`
  const room = it.room ? (it.kind === 'roomChange' ? ` → ${it.room}` : ` ・ ${it.room}`) : ''
  const note = it.note ? ` ・ ${it.note}` : ''
  return `${base}${room}${note}`
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
  const { reception, timetable, running, attendedNow } = useAttendanceEngine()

  // 「今やること」・出席バナー用の現在時刻。分単位で更新して次の授業/締切を追随させる
  // （秒精度のエンジンクロックは購読しない＝出席カウントダウン中にホームが毎秒再レンダーされない。
  //   受付開始/終了は reception の変化で即時反映される）。
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [bulletin, setBulletin] = useState<BulletinItem[]>([])
  const [classEvents, setClassEvents] = useState<ClassEvent[]>([])
  const { version: classEventsVersion } = useClassEventsVersion()

  const [weeklyPatterns, setWeeklyPatterns] = useState<WeeklyPatternMap>({})
  // CLASS掲示の裏取得中フラグ。true の間だけ headless エンジンをマウントする。
  const [bulletinSyncing, setBulletinSyncing] = useState(false)
  const bulletinSyncingRef = useRef(false)
  // 掲示収集の診断（着地ページ・件数）。取得できない原因の切り分け用。開発ビルドでのみ読み書き・表示する。
  const [bulletinDiag, setBulletinDiag] = useState('')
  // 掲示収集の最終ヘルス（層1の正直表示バナー用）。
  const [bulletinHealth, setBulletinHealth] = useState<StoredHealth | null>(null)
  // 掲示の最終更新時刻（層1の鮮度常設表示用）。
  const [bulletinRefreshedAt, setBulletinRefreshedAt] = useState(0)
  // 手動更新をガードでスキップした理由の一時表示。リリースビルドでも出す
  // （診断bulletinDiagは__DEV__限定のため、これが無いと更新ボタンが無反応＝故障に見える）。
  const [syncNotice, setSyncNotice] = useState('')
  const syncNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (syncNoticeTimer.current) clearTimeout(syncNoticeTimer.current)
    },
    [],
  )
  const showSyncNotice = useCallback((msg: string) => {
    setSyncNotice(msg)
    if (syncNoticeTimer.current) clearTimeout(syncNoticeTimer.current)
    syncNoticeTimer.current = setTimeout(() => setSyncNotice(''), SYNC_NOTICE_MS)
  }, [])

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadAssignments()
        .then((map) => active && setAssignments(Object.values(map)))
        .catch(() => undefined)
      loadBulletinDigest()
        .then((b) => active && setBulletin(b))
        .catch(() => undefined)
      if (__DEV__) {
        loadBulletinDiag()
          .then((d) => active && setBulletinDiag(d))
          .catch(() => undefined)
      }
      loadCollectionHealth()
        .then((m) => active && setBulletinHealth(m.bulletin ?? null))
        .catch(() => undefined)
      loadBulletinRefreshedAt()
        .then((at) => active && setBulletinRefreshedAt(at))
        .catch(() => undefined)
      loadWeeklyPatterns()
        .then((m) => active && setWeeklyPatterns(m))
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
  // 授業時間帯(running=出席WebViewが前面/稼働)はCLASSセッションを出席が専有しており、掲示収集を
  // 走らせると同一セッションを奪い合って「別の画面で操作された」＝空ページになり、出席まで不安定化する。
  // そのため授業中は掲示収集を控える（出席絶対優先。掲示は授業後に取得）。
  const startBulletinSync = useCallback(
    (force: boolean) => {
      if (bulletinSyncingRef.current) return
      // CLASS定時メンテナンス帯（2:00–4:00）/オフライン/授業中（出席WebViewがCLASSセッション専有中）は収集しない。
      // 手動タップ(force)時はスキップ理由を短時間表示する（自動起動のスキップでは出さない）。
      const access = evaluateAccess('class', { now: new Date(), isOnline: isOnlineNow() })
      const skip = bulletinSyncSkipReason({ running, access })
      if (skip) {
        const message = bulletinSyncSkipMessage(skip)
        if (skip === 'attending') setBulletinDiag(message)
        if (force) showSyncNotice(message)
        return
      }
      const begin = () => {
        bulletinSyncingRef.current = true
        setBulletinSyncing(true)
        // 収集開始時は残っているスキップ通知（と自動消去タイマー）を確実に片付ける。
        if (syncNoticeTimer.current) clearTimeout(syncNoticeTimer.current)
        setSyncNotice('')
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
    },
    [running, showSyncNotice],
  )

  // エンジン停止中は reception が陳腐化するため信頼しない（授業時間帯の時間割判定のみに委ねる）。
  // 出席済みのときは「出席登録受付中/出席を確認」バナーは出さない（案内が不要・紛らわしい）。
  const rawBanner = computeHomeBanner(timetable, running ? reception : null, tick)
  const banner = attendedNow ? { ...rawBanner, active: false } : rawBanner

  const focus = pickFocusClass(timetable, tick, (code) => isClassOnDate(weeklyPatterns[code], tick))
  const urgent = pickUrgentAssignment(assignments, tick)
  // ストアは全件（既読・フラグ付き含む）を持つため、ホームの「未読」スライドは未読のみに絞る。
  const unreadBulletin = bulletin.filter((b) => b.unread)

  // 「今やること」に集約する当日の内部予定（休講/補講/教室変更/小テスト等）。純粋ロジックで抽出（TDD済み）。
  // 集約対象は内部データ（授業・補講・課題・掲示）のみ。天気などの外部データは通信先制約
  // （LETUS/CLASS/自前バックエンドのみ・CLAUDE.md）に抵触するため不採用。
  const todayItems = todaySchedule(classEvents, tick)

  const [expanded, setExpanded] = useState(true)
  // バナーがマウント中か（引っ込むアニメの間は残し、終わってから外す）。
  const [bannerMounted, setBannerMounted] = useState(true)
  // bannerAnim: 0=上へ引っ込んだ / 1=展開表示。edgeAnim: 0=右端上に隠れ / 1=右下へ到達（線が伝う）。
  // pillOpacity/pillScale: 着地点でボタン化する円の不透明度とバネ（0.9→1.03→1）。
  const bannerAnim = useRef(new Animated.Value(0)).current
  const edgeAnim = useRef(new Animated.Value(0)).current
  const pillOpacity = useRef(new Animated.Value(0)).current
  const pillScale = useRef(new Animated.Value(SPRING.from)).current
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

  // 展開⇄収縮アニメ（モーショントークン準拠・上品に）:
  // 展開=バナーが slow enter で降りる／収縮=バナー格納→短い線が右端を base で伝い→着地点で円が hero spring 着地。
  useEffect(() => {
    if (!banner.active) return
    if (expanded) {
      setBannerMounted(true)
      edgeAnim.setValue(0)
      Animated.timing(bannerAnim, { toValue: 1, duration: DUR.slow, easing: EASE.enter, useNativeDriver: true }).start()
      Animated.timing(pillOpacity, { toValue: 0, duration: DUR.fast, easing: EASE.exit, useNativeDriver: true }).start()
      pillScale.setValue(SPRING.from)
    } else {
      // 1) バナーが base で上へ格納。
      Animated.timing(bannerAnim, { toValue: 0, duration: DUR.base, easing: EASE.exit, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setBannerMounted(false)
        },
      )
      // 2) 短い線が右端を伝って降りる（少し遅れて開始・move）。
      edgeAnim.setValue(0)
      Animated.timing(edgeAnim, { toValue: 1, duration: 420, delay: 120, easing: EASE.move, useNativeDriver: true }).start()
      // 3) 線が着く直前に、着地点で円が hero spring（0.9→1.03→1）で立ち上がる＋fast フェードイン。
      pillScale.setValue(SPRING.from)
      pillOpacity.setValue(0)
      Animated.sequence([
        Animated.delay(120 + 420 - 60),
        Animated.parallel([
          Animated.timing(pillOpacity, { toValue: 1, duration: DUR.fast, easing: EASE.enter, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(pillScale, { toValue: SPRING.over, duration: SPRING.upMs, easing: EASE.enter, useNativeDriver: true }),
            Animated.timing(pillScale, { toValue: SPRING.to, duration: SPRING.downMs, easing: EASE.enter, useNativeDriver: true }),
          ]),
        ]),
      ]).start()
    }
  }, [expanded, banner.active, bannerAnim, edgeAnim, pillOpacity, pillScale])

  function openAttendance() {
    navigation.navigate('Attendance')
  }
  function openBulletin() {
    navigation.navigate('Bulletin')
  }
  // 「今やること」の課題カードから、その課題の詳細（課題タブ内）へ直接飛ぶ。
  function openAssignment(url: string) {
    const screen = isManualUrl(url) ? 'ManualAssignment' : 'LetusAssignmentDetail'
    // initial:false でタブ未訪問時も一覧を下に敷き、詳細から戻れるようにする（stuck防止）。
    navigation.navigate('課題', { screen, params: { url }, initial: false })
  }
  // 「今やること」の授業カードから、その科目の詳細（時間割タブ内）へ飛ぶ。
  function openSubject(f: FocusClass) {
    navigation.navigate('時間割', {
      screen: 'SubjectDetail',
      params: {
        courseCode: f.courseCode,
        name: f.name,
        period: f.period,
        room: f.room,
        teachers: f.teachers,
        isRemote: f.isRemote,
      },
      // initial:false で時間割タブ未訪問時も一覧を下に敷き、科目詳細から戻れるようにする。
      initial: false,
    })
  }

  const accent = banner.kind === 'accepting' ? COLORS.cta : COLORS.emerald
  const tone = urgent ? urgencyTone(urgent, tick) : 'green'
  const toneColor = TONE_COLOR[tone]
  // ピルが右上から右下へ「右端を伝って」降りてくる移動距離。
  const pillTravel = Math.min(Dimensions.get('window').height * 0.55, 460)

  return (
    <View style={styles.wrap}>
      <ScreenBg>
        <ScreenHeader
          title="ホーム"
          icon="home-outline"
          right={
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="設定"
              style={styles.gearBtn}
            >
              <Ionicons name="settings-outline" size={22} color={ui.heading} />
            </Pressable>
          }
        />
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: clearance }]}>
          {/* 開発ビルドの識別タグ（APK名 litus-...-vNN と一致）。公開前に撤去する。 */}
          <Text style={[styles.devTag, { color: ui.labelColor }]}>{BUILD_TAG}</Text>
          {banner.active && bannerMounted ? (
            // 絶対配置で本文の上に重ねる＝展開/格納で下の内容をreflowさせない（配置固定）。
            <View style={styles.overlayAnchor}>
              <Animated.View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  opacity: bannerAnim,
                  transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-SHIFT.large, 0] }) }],
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
            </View>
          ) : null}

          {/* 掲示同期のヒーロー表示: 同期中バナー → 完了で「✓ 最新」ピルへ変形（数秒で自動的に消える）。 */}
          <BulletinSyncStatus syncing={bulletinSyncing} />

          {/* 今やること: 次の授業＋直近の未提出課題＋当日の内部予定（休講/補講/教室変更/小テスト等）を1枚に集約。
              すべて無ければセクションごと隠す。天気は通信先制約により集約対象外（不採用）。 */}
          {focus || urgent || todayItems.length > 0 ? (
            <>
              <SectionLabel>今やること</SectionLabel>
              <View style={[ui.card, styles.focusCard]}>
                {focus ? (
                  <Pressable onPress={() => openSubject(focus)}>
                    <FocusClassRow focus={focus} ui={ui} last={!urgent && todayItems.length === 0} />
                  </Pressable>
                ) : null}
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
                      <Text style={[styles.focusDue, { color: ui.subMuted }]}>
                        {formatDeadline(urgent.deadline)}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
                {(focus || urgent) && todayItems.length > 0 ? (
                  <View style={[styles.focusDivider, { backgroundColor: ui.dividerColor }]} />
                ) : null}
                {todayItems.length > 0 ? (
                  <View style={styles.todayGroup}>
                    {todayItems.map((it, i) => (
                      <View key={`te-${i}`} style={styles.todayEvRow}>
                        <View style={[styles.todayEvTag, { backgroundColor: EVENT_TONE[it.kind] ?? '#8a968f' }]}>
                          <Text style={styles.todayEvTagText}>{eventTypeLabel(it.kind)}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.todayEvTitle, { color: ui.valueColor }]} numberOfLines={1}>{it.courseName}</Text>
                          <Text style={[styles.todayEvSub, { color: ui.labelColor }]} numberOfLines={1}>{eventSubText(it)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {/* CLASS掲示（インフォから移設）。未読ダイジェストが埋まっていればスライド、空ならCTA。 */}
          <View style={styles.bulletinSectionRow}>
            <SectionLabel>CLASS掲示</SectionLabel>
            <Pressable onPress={() => startBulletinSync(true)} hitSlop={10} disabled={bulletinSyncing} style={styles.refreshBtn}>
              {bulletinSyncing ? (
                <ActivityIndicator size="small" color={ui.accentSoft} />
              ) : (
                <Ionicons name="refresh" size={16} color={ui.accentSoft} />
              )}
            </Pressable>
          </View>
          <HealthBanner health={bulletinHealth?.health} source="class" />
          <FreshnessLabel at={bulletinRefreshedAt} />
          {syncNotice ? (
            <Text style={[styles.syncNotice, { color: ui.labelColor }]}>{syncNotice}</Text>
          ) : null}
          {unreadBulletin.length > 0 ? (
            <View style={[ui.card, styles.bulletinCard]}>
              <View style={styles.bulletinHead}>
                <Ionicons name="megaphone-outline" size={18} color={ui.accent} />
                <Text style={[styles.bulletinHeadText, { color: ui.valueColor }]}>CLASS掲示</Text>
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>未読 {unreadBulletin.length}</Text>
                </View>
              </View>
              <Carousel
                intervalMs={3500}
                items={unreadBulletin.map((b) => (
                  <Pressable key={b.id} onPress={openBulletin} style={styles.bulletinSlide}>
                    <View style={[styles.bulletinTag, { backgroundColor: ui.pillBg }]}>
                      <Text style={[styles.bulletinTagText, { color: ui.pillText }]}>
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
                <Text style={[styles.bulletinMore, { color: ui.accentSoft }]}>すべて見る ↗</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={[ui.card, styles.bulletinCta]} onPress={() => startBulletinSync(true)}>
              <Ionicons name="megaphone-outline" size={20} color={ui.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bulletinCtaText, { color: ui.valueColor }]}>
                  {bulletinSyncing
                    ? '掲示を取得しています…'
                    : running
                      ? '授業中は取得を控えています。授業後に取得できます。'
                      : 'まだ取得できていません。タップで取得します。'}
                </Text>
                {__DEV__ && bulletinDiag ? (
                  <Text style={{ color: ui.labelColor, fontSize: 10, marginTop: 4 }}>診断: {bulletinDiag}</Text>
                ) : null}
              </View>
            </Pressable>
          )}

          <SectionLabel>その他</SectionLabel>
          <Pressable style={[ui.card, styles.entry]} onPress={openAttendance}>
            <View style={[styles.entryIcon, { backgroundColor: ui.pillBg }]}>
              <Ionicons name="flash-outline" size={20} color={ui.accent} />
            </View>
            <View style={styles.entryBody}>
              <Text style={[styles.entryTitle, { color: ui.valueColor }]}>出席登録</Text>
              <Text style={[styles.entrySub, { color: ui.labelColor }]}>
                {banner.active ? banner.text : 'CLASSの出席コードを入力'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ui.chevron} />
          </Pressable>
          <Pressable style={[ui.card, styles.entry]} onPress={() => navigation.navigate('Info')}>
            <View style={[styles.entryIcon, { backgroundColor: ui.pillBg }]}>
              <Ionicons name="newspaper-outline" size={20} color={ui.accent} />
            </View>
            <View style={styles.entryBody}>
              <Text style={[styles.entryTitle, { color: ui.valueColor }]}>インフォ</Text>
              <Text style={[styles.entrySub, { color: ui.labelColor }]}>学食・キャンパス情報</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ui.chevron} />
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
                opacity: edgeAnim.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  {
                    translateY: edgeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-pillTravel, 0],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          />
          {/* 着地点で hero spring 着地する円ボタン（0.9→1.03→1・控えめ）。 */}
          <Animated.View
            pointerEvents={expanded ? 'none' : 'auto'}
            style={[
              styles.miniPill,
              {
                backgroundColor: accent,
                bottom: clearance - 8,
                opacity: pillOpacity,
                transform: [{ scale: pillScale }],
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
            if (__DEV__) loadBulletinDiag().then(setBulletinDiag).catch(() => undefined)
            loadCollectionHealth().then((m) => setBulletinHealth(m.bulletin ?? null)).catch(() => undefined)
            loadBulletinRefreshedAt().then(setBulletinRefreshedAt).catch(() => undefined)
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
          {focus.isNow ? (
            <View style={styles.nowLiveBadge}>
              <NowPulse size={6} color="#ffffff" />
              <Text style={styles.nowLiveText}>今の授業</Text>
            </View>
          ) : (
            <View style={[styles.nextBadge, { backgroundColor: ui.pick('rgba(255,255,255,0.6)', '#e3f5ee', DARK.pillBg) }]}>
              <Text style={[styles.nextBadgeText, { color: ui.pick('#053a2c', COLORS.cta, COLORS.emeraldLight) }]}>次の授業</Text>
            </View>
          )}
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

/**
 * 掲示同期のヒーロー表示。`syncing` が true の間は「同期中…」バナーを上部へ出し、false へ落ちた瞬間に
 * バナーを上へ格納→「✓ 最新」ピルを控えめな hero バネ(0.9→1.03→1)で立ち上げ→数秒保持してフェード。
 * idle 時は何も描画しない（レイアウトを占有しない）。動きは transform/opacity のみ。
 */
function BulletinSyncStatus({ syncing }: { syncing: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'done'>('idle')
  const bannerAnim = useRef(new Animated.Value(0)).current // 0=上へ格納 / 1=表示
  const pillOpacity = useRef(new Animated.Value(0)).current
  const pillScale = useRef(new Animated.Value(SPRING.from)).current
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prev = useRef(false)

  useEffect(() => {
    if (syncing && !prev.current) {
      // 開始: バナーが slow enter で降りてくる。
      if (holdTimer.current) clearTimeout(holdTimer.current)
      pillOpacity.setValue(0)
      pillScale.setValue(SPRING.from)
      setPhase('syncing')
      bannerAnim.setValue(0)
      Animated.timing(bannerAnim, { toValue: 1, duration: DUR.slow, easing: EASE.enter, useNativeDriver: true }).start()
    } else if (!syncing && prev.current) {
      // 完了: バナーが exit で上へ格納 → ピルが hero バネで登場 → 保持 → フェードして idle。
      setPhase('done')
      Animated.timing(bannerAnim, { toValue: 0, duration: DUR.base, easing: EASE.exit, useNativeDriver: true }).start()
      pillOpacity.setValue(0)
      pillScale.setValue(SPRING.from)
      Animated.sequence([
        Animated.delay(DUR.fast),
        Animated.parallel([
          Animated.timing(pillOpacity, { toValue: 1, duration: DUR.fast, easing: EASE.enter, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(pillScale, { toValue: SPRING.over, duration: SPRING.upMs, easing: EASE.enter, useNativeDriver: true }),
            Animated.timing(pillScale, { toValue: SPRING.to, duration: SPRING.downMs, easing: EASE.enter, useNativeDriver: true }),
          ]),
        ]),
      ]).start()
      holdTimer.current = setTimeout(() => {
        Animated.timing(pillOpacity, { toValue: 0, duration: DUR.base, easing: EASE.exit, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished) setPhase('idle')
          },
        )
      }, 1900)
    }
    prev.current = syncing
  }, [syncing, bannerAnim, pillOpacity, pillScale])

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
  }, [])

  if (phase === 'idle') return null

  return (
    <View style={styles.syncZone}>
      {/* バナーは done 中も exit を見せるため残す（idle で View ごと外れる）。
          絶対配置で本文の上に重ねる＝マウント/アンマウントしてもレイアウトが動かない。 */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          opacity: bannerAnim,
          transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-SHIFT.large, 0] }) }],
        }}
      >
        <View style={[styles.banner, { backgroundColor: COLORS.cta }]}>
          <View style={styles.bannerDot}>
            <ActivityIndicator size="small" color="#ffffff" />
          </View>
          <View style={styles.bannerBody}>
            <Text style={styles.bannerTitle}>同期中…</Text>
            <Text style={styles.bannerSub}>課題と掲示を更新しています</Text>
          </View>
        </View>
      </Animated.View>
      {/* 完了ピル。バナーが格納された跡（右上）に控えめなバネで現れる。 */}
      <Animated.View
        pointerEvents="none"
        style={[styles.syncPill, { opacity: pillOpacity, transform: [{ scale: pillScale }] }]}
      >
        <Ionicons name="checkmark" size={14} color="#ffffff" />
        <Text style={styles.syncPillText}>最新</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { paddingBottom: 24 },
  devTag: { alignSelf: 'flex-end', fontSize: 11, fontWeight: '700', opacity: 0.7, marginBottom: 2 },
  gearBtn: { padding: 2 },
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

  // 高さ0のアンカー。バナー/ピルは絶対配置でこの上に重ね、本文をreflowさせない（配置の上下ズレ防止）。
  // 出席バナー・同期バナーで共用。
  overlayAnchor: { position: 'relative', height: 0, zIndex: 20 },
  syncZone: { position: 'relative', height: 0, zIndex: 20 },
  syncPill: {
    position: 'absolute',
    top: 6,
    right: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.cta,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#0a6650',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  syncPillText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },

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
  nowLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.cta, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  nowLiveText: { color: '#ffffff', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  nextBadgeText: { fontSize: 10, fontWeight: '700' },
  focusDot: { width: 10, height: 10, borderRadius: 5 },
  focusRight: { alignItems: 'flex-end' },
  focusRel: { fontSize: 15, fontWeight: '700' },
  focusDue: { fontSize: 11, marginTop: 1 },

  bulletinSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn: { padding: 6, marginTop: 8 },
  syncNotice: { fontSize: 11, marginBottom: 8, marginLeft: 2 },
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
  todayGroup: { gap: 8, paddingVertical: 12 },
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
