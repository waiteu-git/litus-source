import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { ScreenBg, ScreenHeader, useUi, useTabBarClearance } from '../ui/screen'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { computeHomeBanner } from '../attendance/homeBanner'
import { useCourseActive } from '../attendance/useCourseActive'
import { homeRemaining } from '../attendance/receptionWindow'
import { todayKey } from '../attendance/attendedState'
import { todayRemainingClasses, type FocusClass } from '../home/focusClass'
import { bulletinEmptyCard } from '../home/bulletinEmptyCard'
import { homeDeadlines } from '../home/homeDeadlines'
import { buildExamCountdown, type ExamCountdownItem } from '../home/examCountdown'
import { loadAssignments } from '../storage/assignmentsStore'
import type { Assignment } from '../storage/assignmentsSerialize'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'
import { loadClassEvents } from '../storage/classEventsStore'
import { todaySchedule } from '../timetableEvents/eventSelectors'
import type { ClassEvent } from '../timetableEvents/classEvent'
import { useClassEventsVersion } from '../timetableEvents/classEventsVersion'
import * as Application from 'expo-application'
import { loadBulletinDigest, loadBulletinDiag } from '../storage/bulletinDigestStore'
import {
  countScheduleNotices,
  formatScheduleNoticeLabel,
  findSingleScheduleNotice,
} from '../timetableEvents/bulletinEvents'
import { formatBuildTag } from '../appVersion'
import { RELEASE_STAGE, shouldShowBuildTag } from '../releaseStage'
import { loadWeeklyPatterns } from '../storage/weeklyPatternStore'
import type { WeeklyPatternMap } from '../storage/weeklyPatternSerialize'
import { isClassOnDate } from '../timetableEvents/weeklyPattern'
import { loadTimetableOverrides, loadCurrentQuarter } from '../storage/timetableOverridesStore'
import { applyQuarterOverrides, resolveCurrentQuarter, type TimetableOverrides } from '../timetableEvents/quarter'
import type { Quarter } from '../parsers/timetable'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { useSync } from '../sync/SyncProvider'
import { useClassSyncConfirm } from '../sync/useClassSyncConfirm'
import HomeSyncButton from '../home/HomeSyncButton'
import { loadCourseNews, mutateCourseNews } from '../storage/courseNewsStore'
import { markCourseSeen, type CourseNewsMap } from '../updates/courseNews'
import ScreenHint from '../tutorial/ScreenHint'
import NotificationPermissionNotice from '../notifications/NotificationPermissionNotice'
import DiagnosticsBanner from '../health/DiagnosticsBanner'
import { COLORS } from '../theme'
import { SPACE } from '../ui/scale'
import { DUR, EASE, SHIFT, SPRING } from '../ui/motion'
import { reducedShift, reducedStagger, shouldAnimateAmbient } from '../ui/reducedMotion'
import { useReducedMotion } from '../ui/useReducedMotion'
import { PressableCard, PressableRow } from '../ui/Pressable'
import { useDisplaySettings } from '../displaySettings'
import type { HomeSectionKey } from '../home/homeSections'
import QuickTilesSection from '../home/QuickTilesSection'
import { useStoreReviewPrompt } from '../review/useStoreReviewPrompt'

// 展開表示から端の小アイコンへ収縮するまでの時間。
const COLLAPSE_AFTER_MS = 5000

/**
 * ホーム画面。起点として「今やること」（次の授業＋直近の未提出課題）を最上部に集約し、続いて CLASS掲示、
 * 出席/インフォ/設定への導線を並べる。出席お知らせバナーは授業時間帯 or CLASS受付中に上部へ展開し、
 * 数秒後に右下の小ピルへ収縮する（判定は純粋ロジック、収縮アニメと遷移だけここで担う）。
 */
export default function HomeScreen() {
  const navigation = useNavigation<any>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { homeLayout, examCountdownStart } = useDisplaySettings()
  const { reception, timetable, running, attendedNow, receptionWindow } = useAttendanceEngine()

  // 「今やること」・出席バナー用の現在時刻。分単位で更新して次の授業/締切を追随させる
  // （秒精度のエンジンクロックは購読しない＝出席カウントダウン中にホームが毎秒再レンダーされない。
  //   受付開始/終了は reception の変化で即時反映される）。
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 60000)
    return () => clearInterval(id)
  }, [])
  // 学期の授業回が終わった科目に出席案内を出し続けないための述語（FABにも同じものを渡す）。
  const courseActive = useCourseActive(tick)

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [bulletin, setBulletin] = useState<BulletinItem[]>([])
  const [classEvents, setClassEvents] = useState<ClassEvent[]>([])
  const { version: classEventsVersion } = useClassEventsVersion()

  const [weeklyPatterns, setWeeklyPatterns] = useState<WeeklyPatternMap>({})
  // 積みコマ（半期科目）の代表選択用。前半/後半の手動指定(override)と「今が前半/後半か」の手動指定。
  const [ttOverrides, setTtOverrides] = useState<TimetableOverrides>({})
  const [ttQuarterPref, setTtQuarterPref] = useState<Quarter | null>(null)
  // 同期の状態・実行は SyncProvider が単独所有（掲示アニメ・鮮度・スキップ理由は上部同期バーに集約）。
  const sync = useSync()
  const requestFullSync = useClassSyncConfirm()
  // アプリ内ストア評価依頼（F）。ゲートが通った時だけ OS の標準の依頼を出す自動判定で、ホームだけが1回呼ぶ。
  useStoreReviewPrompt()
  // 掲示収集の診断（着地ページ・件数）。取得できない原因の切り分け用。開発ビルドでのみ読み書き・表示する。
  const [bulletinDiag, setBulletinDiag] = useState('')
  // LETUS新着（コース活動の増分・見るまで残る累積）。ホームカード用。
  const [courseNews, setCourseNews] = useState<CourseNewsMap>({})

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
      loadWeeklyPatterns()
        .then((m) => active && setWeeklyPatterns(m))
        .catch(() => undefined)
      loadTimetableOverrides()
        .then((o) => active && setTtOverrides(o))
        .catch(() => undefined)
      loadCurrentQuarter()
        .then((q) => active && setTtQuarterPref(q))
        .catch(() => undefined)
      loadClassEvents()
        .then((e) => active && setClassEvents(e))
        .catch(() => undefined)
      loadCourseNews()
        .then((m) => active && setCourseNews(m))
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, []),
  )

  useEffect(() => {
    loadClassEvents().then(setClassEvents).catch(() => undefined)
  }, [classEventsVersion])

  // 課題の保存完了シグナル（背景収集・統合同期の課題フェーズ・手動編集）で「直近の締切」を追随させる
  // （課題画面と同じ契約。フォーカス中の再読込だけだと同期完了がホームに反映されない）。
  const { version: assignmentsVersion } = useAssignmentsVersion()
  useEffect(() => {
    loadAssignments()
      .then((map) => setAssignments(Object.values(map)))
      .catch(() => undefined)
  }, [assignmentsVersion])

  // 掲示同期の完了（bulletinBusy の下降）で、開きっぱなしのホームにも収集結果を反映する。
  const prevBulletinBusy = useRef(false)
  useEffect(() => {
    if (prevBulletinBusy.current && !sync.bulletinBusy) {
      loadBulletinDigest().then(setBulletin).catch(() => undefined)
      if (__DEV__) loadBulletinDiag().then(setBulletinDiag).catch(() => undefined)
    }
    prevBulletinBusy.current = sync.bulletinBusy
  }, [sync.bulletinBusy])

  // 課題同期の完了（assignmentBusy の下降）で、LETUS新着カードへ増分を反映する。
  const prevAssignmentBusy = useRef(false)
  useEffect(() => {
    if (prevAssignmentBusy.current && !sync.assignmentBusy) {
      loadCourseNews().then(setCourseNews).catch(() => undefined)
    }
    prevAssignmentBusy.current = sync.assignmentBusy
  }, [sync.assignmentBusy])

  // LETUS新着カードの行（新しい検知が上）。行タップでコースを開き、そのコースの新着を既読化する。
  const newsRows = Object.entries(courseNews)
    .map(([url, e]) => ({
      url,
      name: e.name,
      count: e.items.length,
      latestTitle: e.items[e.items.length - 1]?.title ?? '',
      latestAt: e.items.reduce((m, i) => Math.max(m, new Date(i.detectedAt).getTime() || 0), 0),
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.latestAt - a.latestAt)
  const newsTotal = newsRows.reduce((n, r) => n + r.count, 0)
  function openCourseNews(r: { url: string; name: string }) {
    mutateCourseNews((cur) => markCourseSeen(cur, r.url)).catch(() => undefined)
    setCourseNews((cur) => markCourseSeen(cur, r.url))
    navigation.navigate('時間割', {
      screen: 'Web',
      params: { url: r.url, title: r.name || 'LETUSコース' },
      // initial:false で時間割タブ未訪問時も一覧を下に敷き、コースから戻れるようにする。
      initial: false,
    })
  }

  // 積みコマ（半期科目）の代表選択用に override をマージし、現在半期（手動指定優先・無ければ日付既定）を算出。
  const ttQ = useMemo(() => timetable.map((c) => ({ ...c, slots: applyQuarterOverrides(c.slots, ttOverrides) })), [timetable, ttOverrides])
  const cq = resolveCurrentQuarter(ttQuarterPref, tick)

  // エンジン停止中は reception が陳腐化するため信頼しない（授業時間帯の時間割判定のみに委ねる）。
  // 出席済みのときは「出席登録受付中/出席を確認」バナーは出さない（案内が不要・紛らわしい）。
  const rawBanner = computeHomeBanner(ttQ, running ? reception : null, tick, cq, courseActive)
  const banner = attendedNow ? { ...rawBanner, active: false } : rawBanner

  const classes = todayRemainingClasses(ttQ, tick, (code) => isClassOnDate(weeklyPatterns[code], tick), cq)
  const hero = classes[0] ?? null
  const laterClasses = classes.slice(1)
  // 直近の締切タイルの件数＝上限なし・未提出のみ（他の件数タイルと同じ意味に揃える）。
  const deadlineCount = homeDeadlines(assignments, tick, Infinity).reduce(
    (n, g) => n + g.items.filter((it) => !it.done).length,
    0,
  )
  // 試験カウントダウン（手動登録の試験のみ。課題の締切は「直近の締切」が担う）。純ロジックがTDD済み。
  // periodTimes を渡すと当日の試験は時限終了で消える。CLASSの時限表は学期をまたいで共通（jigen 1つを
  // 全collectionに配る）ため、最初に取れたものを使う。未取得なら null＝日付のみの判定へフォールバック。
  const ttPeriodTimes = ttQ.find((c) => c.periodTimes)?.periodTimes ?? null
  const countdownItems = buildExamCountdown(classEvents, tick, 3, ttPeriodTimes, examCountdownStart)
  // いまの授業の「残り」面。**出席の受付時間が分かっていればそれを、無ければ授業の残りを**出す。
  // 受付は授業より早く閉じるのが普通なので、時限終了までを一律「残り」と出しつつタップ先が
  // 出席登録だと「まだ90分ある」と誤読させる。採否（今日か・このコマにアンカーできるか）は
  // homeRemaining が単独で決める＝古い保存・別コマの保存は自動で無視され授業ベースへ落ちる。
  const remain = homeRemaining({ hero, saved: receptionWindow, today: todayKey(tick), now: tick })
  // ストアは全件（既読・フラグ付き含む）を持つため、ホームの「未読」スライドは未読のみに絞る。
  const unreadBulletin = bulletin.filter((b) => b.unread)
  const scheduleNoticeCounts = countScheduleNotices(bulletin)
  const scheduleNoticeLabel = formatScheduleNoticeLabel(scheduleNoticeCounts)
  // 未読0件時のカード分岐（純ロジック）。「取得済みで未読なし」と「未取得」を区別する。
  const bulletinEmpty = bulletinEmptyCard({
    syncing: sync.bulletinBusy,
    running,
    collected: sync.lastBulletinAt > 0 || bulletin.length > 0,
  })

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
  // Reduce Motion（E0 M5〜M7）。描画時の変位は reduce をそのまま使い、下の展開⇄収縮エフェクトでは ref で読む
  // （依存に入れると、設定を切り替えた瞬間に収縮の演出が再生される）。
  const reduce = useReducedMotion()
  const reduceRef = useRef(reduce)
  reduceRef.current = reduce
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
  // Reduce Motion（E0 M5〜M7）: 降下の変位0（描画時に reducedShift）・線を動かさない・円は待たずバネなしの fade だけ。
  useEffect(() => {
    if (!banner.active) return
    const rm = reduceRef.current
    if (expanded) {
      setBannerMounted(true)
      edgeAnim.setValue(0)
      Animated.timing(bannerAnim, { toValue: 1, duration: DUR.slow, easing: EASE.enter, useNativeDriver: true }).start()
      Animated.timing(pillOpacity, { toValue: 0, duration: DUR.fast, easing: EASE.exit, useNativeDriver: true }).start()
      pillScale.setValue(rm ? SPRING.to : SPRING.from)
    } else {
      // 1) バナーが base で上へ格納。
      Animated.timing(bannerAnim, { toValue: 0, duration: DUR.base, easing: EASE.exit, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setBannerMounted(false)
        },
      )
      // 2) 短い線が右端を伝って降りる（少し遅れて開始・move）。Reduce Motion では動かさない（不透明度0のまま＝M6）。
      edgeAnim.setValue(0)
      if (shouldAnimateAmbient(rm)) {
        Animated.timing(edgeAnim, { toValue: 1, duration: 420, delay: 120, easing: EASE.move, useNativeDriver: true }).start()
      }
      // 3) 線が着く直前に、着地点で円が hero spring（0.9→1.03→1）で立ち上がる＋fast フェードイン。
      //    Reduce Motion では 480ms 待たず（reducedStagger）、拡大率1のまま fade だけで出す（M7）。
      pillScale.setValue(rm ? SPRING.to : SPRING.from)
      pillOpacity.setValue(0)
      const fadeIn = Animated.timing(pillOpacity, { toValue: 1, duration: DUR.fast, easing: EASE.enter, useNativeDriver: true })
      Animated.sequence([
        Animated.delay(reducedStagger(rm, 120 + 420 - 60)),
        rm
          ? fadeIn
          : Animated.parallel([
              fadeIn,
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
  // 休講/補講/教室変更の通知タップ：該当がちょうど1件ならその掲示へ直接、
  // それ以外（0件＝到達しないはずだが安全側／2件以上）は掲示一覧の「授業」タブへ。
  function openScheduleNotice() {
    const only = findSingleScheduleNotice(bulletin)
    if (only) {
      navigation.navigate('BulletinDetail', { id: only.id })
      return
    }
    navigation.navigate('Bulletin', { initialTab: 'schedule' })
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

  // 試験カウントダウンの行タップ。その予定の編集画面へ（日付・時限・メモが揃う唯一の面。
  // 科目詳細は courseCode が無い手動登録では開けないため、常に着地できるこちらを選ぶ）。
  // 試験カウントダウンから、その科目の詳細（時間割タブ内）へ飛ぶ。試験そのものより
  // 「その科目の各回の予定・出欠・LETUSコース」へ繋がる方が使い道が広い（予定の編集は
  // 科目詳細からも辿れる）。科目コードを持たない手動イベントだけは詳細を開けないので、
  // 従来どおり予定の編集へ落とす。
  function openCountdown(it: ExamCountdownItem) {
    if (it.courseCode) {
      navigation.navigate('時間割', {
        screen: 'SubjectDetail',
        params: { courseCode: it.courseCode, name: it.courseName },
        // initial:false で時間割タブ未訪問時も一覧を下に敷き、科目詳細から戻れるようにする。
        initial: false,
      })
      return
    }
    navigation.navigate('時間割', {
      screen: 'ClassEventForm',
      params: { courseName: it.courseName, courseCode: it.courseCode, editId: it.eventId },
      initial: false,
    })
  }

  const accent = banner.kind === 'accepting' ? COLORS.cta : COLORS.emerald
  // ピルが右上から右下へ「右端を伝って」降りてくる移動距離。
  const pillTravel = Math.min(Dimensions.get('window').height * 0.55, 460)

  return (
    <View style={styles.wrap}>
      <ScreenBg>
        <ScreenHeader
          title="ホーム"
          icon="home-outline"
          right={
            <>
              {/* 統合同期の状況＋操作をヘッダーに集約（タップで掲示→課題の順次同期）。 */}
              <HomeSyncButton />
              <Pressable
                onPress={() => navigation.navigate('Settings')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="設定"
                style={styles.gearBtn}
              >
                <Ionicons name="settings-outline" size={22} color={ui.heading} />
              </Pressable>
            </>
          }
        />
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: clearance }]}>
          {/* 開発ビルドの識別タグ（versionCode 由来＝APK名 litus-...-vNN と一致）。production では出さない。 */}
          {shouldShowBuildTag(RELEASE_STAGE) ? (
            <Text style={[styles.devTag, { color: ui.labelColor }]}>{formatBuildTag(Application.nativeBuildVersion)}</Text>
          ) : null}
          {/* 同期の状況＋操作はヘッダー右の HomeSyncButton へ集約（鮮度・スキップ理由・ヘルス注意）。 */}
          {/* 初回ヒント（×で永続的に消える・設定から再表示可）。 */}
          <ScreenHint hintKey="home" />
          {/* OS で通知が塞がれている間の回復導線。拒否した人は設定画面に来ないのでここにも出す。
              ただし常駐させない: 時間割も課題も無い＝通知が仕事をしていない状態では出さない
              （通知を意図的に切っている人に常駐広告を出さないため）。 */}
          <NotificationPermissionNotice active={hero != null || assignments.length > 0} />
          {/* LETUS 自己診断バナー（読み取り不調/ログアウト/未対応を正直に示す＋再取得導線）。
              表示要否は診断台帳が握る（activeCodes 空なら何も描かない）。デモ中は自身で null を返す。 */}
          <DiagnosticsBanner />
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
                  // Reduce Motion では変位0（fade だけ）。描画時に計算するので、値が途中で確定しても次の描画から0になる（M5）。
                  transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-reducedShift(reduce, SHIFT.large), 0] }) }],
                }}
              >
                <Pressable
                  style={[styles.banner, { backgroundColor: accent }]}
                  onPress={openAttendance}
                  accessibilityRole="button"
                >
                  <View style={styles.bannerDot}>
                    <Ionicons name="flash" size={18} color={COLORS.white} />
                  </View>
                  <View style={styles.bannerBody}>
                    <Text style={styles.bannerTitle} numberOfLines={2}>
                      {banner.text}
                    </Text>
                    <Text style={styles.bannerSub}>タップで出席へ</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
                </Pressable>
              </Animated.View>
            </View>
          ) : null}

          {/* 同期の演出はヘッダー右の HomeSyncButton（掲示同期中スピナー）に一本化。ホーム本文には
              上から降りてくる同期バナーを出さず、ヘッダーのインジケーターだけを動かす（本文reflowゼロ）。 */}

          {(() => {
            const sectionNodes: Record<HomeSectionKey, ReactNode> = {
              // 並び順・表示はユーザーが設定タブで変更可能（homeLayout）。以下は各セクションのJSX。
              // いまの授業ヒーロー（進行中/次の授業）。今の授業は最優先縁＋残り時間＋進捗。
              nowClass: hero ? (
            <PressableCard
              style={[ui.card, styles.hero, hero.isNow && { borderColor: ui.colors.priorityBorder }]}
              onPress={() => openSubject(hero)}
              // 内側に別導線（残り時間タップ＝出席）を持つため、カードを単一のa11y要素に潰さない。
              // これで内側の出席ボタンがスクリーンリーダーから個別にフォーカスできる（授業情報のテキストも各々読まれる）。
              accessible={false}
            >
              <View style={styles.heroTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.heroLabel, { color: ui.labelColor }]}>
                    {hero.isNow ? `いまの授業・${hero.period}限` : `次の授業・${hero.period}限`}
                  </Text>
                  <Text style={[styles.heroTitle, { color: ui.valueColor }]} numberOfLines={1}>{hero.name}</Text>
                  <Text style={[styles.heroMeta, { color: ui.labelColor }]} numberOfLines={1}>
                    {hero.room}{hero.room ? ' ・ ' : ''}{hero.start}–{hero.end}{hero.isRemote ? ' ・ 遠隔' : ''}
                  </Text>
                </View>
                {banner.active && banner.kind === 'accepting' ? (
                  <View style={[styles.attendPill, { backgroundColor: ui.pillBg }]}>
                    <View style={[styles.attendDot, { backgroundColor: ui.pillText }]} />
                    <Text style={[styles.attendPillText, { color: ui.pillText }]}>出席受付中</Text>
                  </View>
                ) : null}
              </View>
              {remain ? (
                // 残り時間の面はタップで出席登録へ（授業中の最有力アクション）。カード本体の科目詳細遷移とは
                // 別導線。内側Pressableがタップを取るのでカードのonPress（openSubject）とは競合しない。
                <PressableRow
                  style={[styles.heroSoftbox, { backgroundColor: ui.softBoxBg }]}
                  onPress={openAttendance}
                  accessibilityRole="button"
                  accessibilityLabel={remain.a11yLabel}
                >
                  <View style={styles.remainRow}>
                    <View style={styles.remainLeft}>
                      {remain.kind === 'closed' ? (
                        // 受付が閉じた＝数値を出す対象が無い。授業の残りを「残り」と出すと出席できると
                        // 誤読させるため、ここは事実（受付終了）だけを述べる。
                        <Text style={[styles.remainStat, { color: ui.labelColor }]}>受付終了</Text>
                      ) : (
                        <>
                          <Text style={[styles.remainLabel, { color: ui.labelColor }]}>{remain.label}</Text>
                          <Text style={[styles.remainStat, { color: ui.valueColor }]}>{remain.minutes}分</Text>
                        </>
                      )}
                    </View>
                    <Text style={[styles.remainEnd, { color: ui.labelColor }]}>{remain.endText}</Text>
                  </View>
                  {/* 残り時間バー: 幅＝残り率。左詰めのまま右端が縮む＝時間が減るほど右から減っていく。
                      受付時間が分かっていれば受付に対する率、無ければ授業に対する率（remainPctが決める）。 */}
                  <View style={[styles.progressTrack, { backgroundColor: ui.dividerColor }]}>
                    <View style={[styles.progressFill, { width: `${remain.remainPct}%`, backgroundColor: ui.pick(COLORS.cta, COLORS.emerald, COLORS.emeraldLight) }]} />
                  </View>
                  <View style={styles.remainCta}>
                    <Ionicons name="flash-outline" size={13} color={ui.accent} />
                    <Text style={[styles.remainCtaText, { color: ui.accentSoft }]}>
                      {remain.kind === 'closed' ? 'タップで出席画面へ' : 'タップで出席登録'}
                    </Text>
                    <Ionicons name="chevron-forward" size={13} color={ui.accentSoft} />
                  </View>
                </PressableRow>
              ) : null}
            </PressableCard>
          ) : null,
              // 休講/補講/教室変更のお知らせ（独立セクション・fixedOn＝非表示不可、並べ替えは可）。
              // 「CLASS掲示」をOFF/並べ替えしても埋もれないよう、bulletinsから独立させている（2026-09-14）。
              scheduleNotice: scheduleNoticeLabel ? (
                <PressableRow
                  onPress={openScheduleNotice}
                  style={[styles.scheduleNotice, { backgroundColor: ui.colors.infoBg }]}
                  accessibilityRole="button"
                  accessibilityLabel={scheduleNoticeLabel}
                >
                  <Ionicons name="alert-circle-outline" size={18} color={ui.colors.info} />
                  <Text style={[styles.scheduleNoticeText, { color: ui.colors.info }]}>{scheduleNoticeLabel}</Text>
                  <Ionicons name="chevron-forward" size={16} color={ui.colors.info} />
                </PressableRow>
              ) : null,
              quickTiles: (
                <>
                  <QuickTilesSection
                    todayItems={todayItems}
                    newsRows={newsRows}
                    newsTotal={newsTotal}
                    onPressNews={openCourseNews}
                    countdownItems={countdownItems}
                    onPressCountdown={openCountdown}
                    bulletinCount={unreadBulletin.length}
                    bulletinEmptyText={bulletinEmpty.text}
                    onPressBulletin={
                      unreadBulletin.length > 0 || bulletinEmpty.action === 'list' ? openBulletin : requestFullSync
                    }
                    deadlineCount={deadlineCount}
                    onPressDeadlines={() => navigation.navigate('課題')}
                    laterClassesCount={laterClasses.length}
                    onPressLaterClasses={() => navigation.navigate('時間割')}
                    attendanceSubtitle={banner.active ? banner.text : 'CLASSの出席コードを入力'}
                    onPressAttendance={openAttendance}
                    onPressInfo={() => navigation.navigate('Info')}
                  />
                  {__DEV__ && bulletinDiag ? (
                    <Text style={{ color: ui.labelColor, fontSize: 10, marginTop: 8 }}>診断: {bulletinDiag}</Text>
                  ) : null}
                </>
              ),
            }
            return homeLayout
              .filter((s) => s.enabled)
              .map((s) => {
                const node = sectionNodes[s.key]
                // 各セクションを marginBottom で区切る（カード＝ui.card は余白ゼロで、
                // hero等の各セクションのコンテナも margin 無し＝隣接して詰まって見えるため）。
                // 該当データ無しの null セクションは余白も出さない（空きの間延び防止）。
                return node ? (
                  <View key={s.key} style={styles.sectionGap}>
                    {node}
                  </View>
                ) : null
              })
          })()}
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
            <Pressable onPress={openAttendance} accessibilityRole="button" accessibilityLabel={banner.text} style={styles.miniPillHit}>
              <Ionicons name="flash" size={16} color={COLORS.white} />
            </Pressable>
          </Animated.View>
        </>
      ) : null}

    </View>
  )
}

const styles = StyleSheet.create({
  scheduleNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  scheduleNoticeText: { flex: 1, fontSize: 13, fontWeight: '600' },
  wrap: { flex: 1 },
  scroll: { paddingBottom: 24 },
  // ホーム各セクション間の余白（カード同士が詰まらないよう区切る）。
  sectionGap: { marginBottom: SPACE.s3 },
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
    shadowColor: COLORS.emeraldDark,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bannerDot: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.whiteOverlay25, alignItems: 'center', justifyContent: 'center' },
  bannerBody: { flex: 1 },
  bannerTitle: { color: COLORS.white, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  bannerSub: { color: COLORS.whiteSubtle90, fontSize: 12, marginTop: 2 },

  // 高さ0のアンカー。バナー/ピルは絶対配置でこの上に重ね、本文をreflowさせない（配置の上下ズレ防止）。
  // 出席バナー・同期バナーで共用。
  overlayAnchor: { position: 'relative', height: 0, zIndex: 20 },

  // いまの授業ヒーロー
  hero: {},
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroLabel: { fontSize: 12, fontWeight: '500', letterSpacing: 0.3 },
  heroTitle: { fontSize: 21, lineHeight: 27, fontWeight: '700', marginTop: 2 },
  heroMeta: { fontSize: 13, marginTop: 6 },
  attendPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  attendDot: { width: 7, height: 7, borderRadius: 4 },
  attendPillText: { fontSize: 11, fontWeight: '700' },
  heroSoftbox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  remainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  remainLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  remainLabel: { fontSize: 12, fontWeight: '500' },
  remainStat: { fontSize: 22, fontWeight: '700' },
  remainEnd: { fontSize: 11 },
  progressTrack: { height: 4, borderRadius: 999, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 999 },
  // 残り時間面の「タップで出席登録」導線（タップ可能であることを示す）。
  remainCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  remainCtaText: { fontSize: 12, fontWeight: '600' },
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
    shadowColor: COLORS.emeraldDark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
})
