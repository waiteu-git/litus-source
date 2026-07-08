import { useEffect, useReducer, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { WebView } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import { ScreenBg, CountdownRing } from '../ui/screen'
import { useLoginGate } from '../auth/LoginGate'
import {
  CLASS_PC_LOGIN_URL,
  DESKTOP_UA,
  DETECT_ATTENDANCE_JS,
  DETECT_PAGE_JS,
  ENTER_CLASS_PC_JS,
  OPEN_ATTENDANCE_JS,
  buildSubmitAttendanceJs,
} from '../collect/injectedScripts'
import { parseAttendanceMessage } from '../collect/attendanceMessage'
import { classifyClassPage } from '../attendance/classifyClassPage'
import { useClassView } from '../collect/classViewArbiter'
import { countdownText } from '../attendance/countdown'
import { normalizeAttendanceCode } from '../attendance/normalizeCode'
import {
  attendanceReducer,
  initialEngineState,
  type EnginePhase,
  type SubmitResult,
} from '../attendance/engine'
import { COLORS, useThemeVariant } from '../theme'

// 入口スプラッシュを踏まずPC側SSOへ直行（再訪時の遷移を1ホップ短縮。スプラッシュ処理は保険で残す）。
const CLASS_URL = CLASS_PC_LOGIN_URL
// 自動遷移が進んでいる間はオーバーレイを出さないよう、ページ読込ごとにこの秒数へ再アームする。
const NAV_TIMEOUT_MS = 10000
// 出席ページ滞在中に受付状況を取り直す間隔（開きっぱなしで授業開始を拾うため）。
const ATTENDANCE_POLL_MS = 30000

export default function AttendanceScreen() {
  const webviewRef = useRef<WebView>(null)
  const inputRef = useRef<TextInput>(null)
  const portalTriesRef = useRef(0)
  // システムエラー（ViewExpired等）からの自動復帰は1回だけ（ループ防止）。
  const errorRetryRef = useRef(0)
  // AppStateリスナーから最新phaseを参照するためのref（リスナー再登録を避ける）。
  const phaseRef = useRef<EnginePhase>('booting')
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { variant } = useThemeVariant()
  // green（翠グラデ）テーマか。白テーマではソリッド配色。変数名はスタイル名(glass系)との対応で温存。
  const glass = variant === 'green'
  const loginGate = useLoginGate()
  // CLASSは同一セッションの複数画面を禁止する。出席のWebViewは**一度開いたら持続**させ
  // （タブ切替で破棄しない＝再訪ゼロ秒・「別の画面」エラーも出ない）、時間割収集など他の
  // CLASS利用者がフォーカスされている間だけ譲る（classViewArbiter）。
  const { collectActive } = useClassView()
  const collectActiveRef = useRef(false)
  collectActiveRef.current = collectActive
  const prevCollectRef = useRef(false)
  // 出席ページに滞在中か（受付有無に関わらず）。定期リフレッシュの実行条件に使う。
  const onAttendanceRef = useRef(false)
  const isFocused = useIsFocused()
  const firstFocusRef = useRef(true)
  const [state, dispatch] = useReducer(attendanceReducer, initialEngineState)
  const [code, setCode] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [webviewKey, setWebviewKey] = useState(0)
  const [now, setNow] = useState(() => new Date())
  // 取得失敗（navFailed）でも生CLASSは自動表示しない。ユーザーが明示的に押した時だけ表示する。
  const [revealClass, setRevealClass] = useState(false)
  // 取得失敗の回数。数回失敗したら「CLASSの画面を表示」ボタンを出す（手動エスカレーション）。
  const [failCount, setFailCount] = useState(0)

  // booting を抜けたらナビタイマーを止める（アンマウント時も）。
  useEffect(() => {
    if (state.phase !== 'booting' && navTimerRef.current) {
      clearTimeout(navTimerRef.current)
      navTimerRef.current = null
    }
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current)
    }
  }, [state.phase])

  phaseRef.current = state.phase

  // 取得失敗に入るたびに回数を数える（数回でCLASS表示ボタンを解禁）。
  useEffect(() => {
    if (state.phase === 'navFailed') setFailCount((n) => n + 1)
  }, [state.phase])

  // 時間割収集がCLASSを使い終わったら、WebViewを作り直して出席を再開する（使用中は譲って
  // アンマウントされている）。reception は保持してキャッシュ表示。
  useEffect(() => {
    if (prevCollectRef.current && !collectActive) {
      portalTriesRef.current = 0
      errorRetryRef.current = 0
      dispatch({ kind: 'reboot' })
      setWebviewKey((k) => k + 1)
    }
    prevCollectRef.current = collectActive
  }, [collectActive])

  // タブ再訪時はWebViewが持続しているため再読込せず、静かに再判定だけ行う。出席ページに居るなら
  // サーバから受付状況を取り直す（DOMは自動更新されないため、開始した授業を拾うにはリフレッシュ必須）。
  useEffect(() => {
    if (!isFocused) return
    if (firstFocusRef.current) {
      firstFocusRef.current = false
      return
    }
    if (onAttendanceRef.current) refreshAttendance()
    else webviewRef.current?.injectJavaScript(DETECT_PAGE_JS)
  }, [isFocused])

  // フォアグラウンド復帰時に再判定/リフレッシュ（長時間放置でセッション切れ/古い受付状況のまま
  // 固まるのを防ぐ）。送信中はWebView状態を壊さないようスキップ。
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || phaseRef.current === 'submitting') return
      if (onAttendanceRef.current) refreshAttendance()
      else webviewRef.current?.injectJavaScript(DETECT_PAGE_JS)
    })
    return () => sub.remove()
  }, [])

  // 出席ページ滞在中は定期的にサーバから受付状況を取り直す（開きっぱなしで授業が始まったら
  // 自動で「受付中」に切り替わるように）。CLASSのページDOMは自動更新されないためポーリングが必須。
  // 収集がCLASSを使用中・送信中は触らない。
  useEffect(() => {
    const id = setInterval(() => {
      if (onAttendanceRef.current && !collectActiveRef.current && phaseRef.current !== 'submitting') {
        refreshAttendance()
      }
    }, ATTENDANCE_POLL_MS)
    return () => clearInterval(id)
  }, [])

  // 受付中かつ確認時間が取れていれば毎秒 now を更新してカウントダウン表示。
  useEffect(() => {
    if (!(state.reception?.accepting && state.reception.confirmWindow)) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [state.reception])

  // 受付状況に連動して展開/集約を自動化（受付中＝展開／受付なし＝集約）。以後は手動トグルで上書き可。
  useEffect(() => {
    if (state.reception) setExpanded(state.reception.accepting)
  }, [state.reception])

  function inject(js: string) {
    webviewRef.current?.injectJavaScript(js)
  }

  function armNavTimeout() {
    if (navTimerRef.current) clearTimeout(navTimerRef.current)
    navTimerRef.current = setTimeout(() => dispatch({ kind: 'navTimeout' }), NAV_TIMEOUT_MS)
  }

  /**
   * 自動やり直し: WebViewを作り直して最初から遷移し直す（手動「やり直す」の自動版）。
   * エラーページ検知・CLASSホーム滞留の双方から呼ばれる。上限2回、超えたら手動オーバーレイへ。
   */
  function autoRestart() {
    if (errorRetryRef.current < 2) {
      errorRetryRef.current += 1
      portalTriesRef.current = 0
      dispatch({ kind: 'reboot' })
      setWebviewKey((k) => k + 1)
    } else {
      dispatch({ kind: 'errorPage' })
    }
  }

  /**
   * 出席ページの受付状況をサーバから取り直す。メニュー「出欠管理→モバイル出席登録」を
   * 再クリック（JSF再要求）してページを再レンダリングさせ、少し待って受付状況を再抽出する。
   * 授業開始/終了でサーバ側の受付が変わっても、これで拾える（DOMは勝手に更新されないため）。
   */
  function refreshAttendance() {
    inject(OPEN_ATTENDANCE_JS)
    setTimeout(() => inject(DETECT_ATTENDANCE_JS), 1600)
  }

  function onLoadEnd() {
    if (state.phase === 'booting') armNavTimeout()
    inject(DETECT_PAGE_JS)
  }

  function onMessage(data: string) {
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (!parsed) return
    if (parsed.type === 'page') {
      const kind = classifyClassPage({
        hasPasswordInput: !!parsed.hasPasswordInput,
        hasAttendanceForm: !!parsed.hasAttendanceForm,
        hasEnterSplash: !!parsed.hasEnterSplash,
        hasClassMenu: !!parsed.hasClassMenu,
        hasSystemError: !!parsed.hasSystemError,
        url: typeof parsed.url === 'string' ? parsed.url : undefined,
      })
      dispatch({ kind: 'page', page: kind })
      onAttendanceRef.current = kind === 'attendance'
      if (kind === 'login') {
        // セッション切れ → 専用ログインゲートへ（アプリ全体をログイン画面に切替）。
        loginGate.requireLogin()
      } else if (kind === 'attendance') {
        portalTriesRef.current = 0
        errorRetryRef.current = 0
        inject(DETECT_ATTENDANCE_JS)
      } else if (kind === 'splash') {
        // 入口スプラッシュ → PC側へURL直遷移（遷移すれば次の onLoadEnd で再判定される）。
        inject(ENTER_CLASS_PC_JS)
      } else if (kind === 'portal') {
        if (portalTriesRef.current < 3) {
          portalTriesRef.current += 1
          inject(OPEN_ATTENDANCE_JS)
          // メニュー発火がAJAX部分更新だと onLoadEnd が来ないため、少し待って再判定（粘り）。
          // まだ portal なら上の試行上限内で再試行、attendance に変わっていれば受付検出へ進む。
          setTimeout(() => inject(DETECT_PAGE_JS), 1500)
        } else {
          // メニュー遷移が効かずCLASSホームに留まる場合も自動やり直しの対象（ユーザー要望）。
          autoRestart()
        }
      } else if (kind === 'error') {
        // JSFのViewExpired・「別の画面で操作された」等 → 自動やり直し。
        autoRestart()
      }
      return
    }
    if (parsed.type === 'nav') {
      // 自動遷移の段階ログ（実機切り分け用）。stage: class-pc-enter / menu-opened / attendance-click / menu 等
      console.log('[attendance nav]', data)
      return
    }
    if (parsed.type === 'attendance') {
      dispatch({ kind: 'reception', reception: parseAttendanceMessage(data) })
      return
    }
    if (parsed.type === 'submit') {
      const result: SubmitResult = {
        result: typeof parsed.result === 'string' ? parsed.result : '送信しました',
        ok: !!parsed.ok,
        wrong: !!parsed.wrong,
        err: !!parsed.err,
      }
      dispatch({ kind: 'submitResult', result })
    }
  }

  function submit() {
    const c = normalizeAttendanceCode(code)
    if (!c) return
    dispatch({ kind: 'submitStart' })
    inject(buildSubmitAttendanceJs(c))
  }

  function retry() {
    setCode('')
    portalTriesRef.current = 0
    errorRetryRef.current = 0
    setRevealClass(false)
    dispatch({ kind: 'retry' })
    setWebviewKey((k) => k + 1)
  }

  const c = COLORS

  // booting中でも前回の受付状況をキャッシュ表示し、裏の再遷移を待たせない（（更新中…）を添える）。
  const updating = state.phase === 'booting' && state.reception != null
  const statusLine =
    state.reception && state.reception.accepting
      ? `受付中: ${state.reception.courseName ?? ''}${updating ? '（更新中…）' : ''}`
      : state.phase === 'ready'
        ? '受付中の授業はありません'
        : state.phase === 'navFailed'
          ? '受付状況を取得できませんでした'
          : updating
            ? '受付状況を更新しています…'
            : '受付状況を確認しています…'

  const resultBanner = state.result
    ? {
        text: state.result.result,
        bg: state.result.ok ? c.successBg : c.dangerBg,
        fg: state.result.ok ? c.success : c.danger,
      }
    : null

  const digits = [0, 1, 2, 3].map((i) => code[i] ?? '')

  const cardStyle = glass
    ? { backgroundColor: 'rgba(255,255,255,0.34)', borderColor: 'rgba(255,255,255,0.55)', borderWidth: 1 }
    : { backgroundColor: c.white, borderColor: '#e3ece8', borderWidth: 1 }
  const labelColor = glass ? c.labelOnGlass : c.emeraldDark
  const valueColor = glass ? c.inkOnGlass : c.ink
  const accepting = !!state.reception?.accepting

  return (
    <View style={styles.wrap}>
      <ScreenBg>
        <View style={styles.header}>
          <View style={styles.hLeft}>
            <Ionicons name="flash-outline" size={22} color={glass ? c.white : c.emeraldDark} />
            <Text style={[styles.hTitle, { color: glass ? c.white : c.emeraldDark }]}>出席</Text>
          </View>
          <Text style={[styles.pill, glass ? styles.pillGlass : styles.pillSolid]}>
            {state.phase === 'needsLogin' ? 'ログインが必要' : state.reception ? 'ログイン済み' : '確認中…'}
          </Text>
        </View>

        <View style={styles.toggleRow}>
          <Pressable onPress={() => setExpanded(true)} style={[styles.toggle, expanded && styles.toggleOn]}>
            <Text style={[styles.toggleText, expanded && styles.toggleTextOn]}>展開</Text>
          </Pressable>
          <Pressable onPress={() => setExpanded(false)} style={[styles.toggle, !expanded && styles.toggleOn]}>
            <Text style={[styles.toggleText, !expanded && styles.toggleTextOn]}>集約</Text>
          </Pressable>
        </View>

        {/* ライブ・ヒーロー型（Turn1で確定した1d案）。受付中は大きな円形カウントダウンを主役に、
            それ以外は控えめなステータス表示にとどめる。 */}
        <View style={[styles.card, cardStyle, styles.hero]}>
          {accepting ? (
            <>
              <View style={styles.liveBadgeRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>受付中</Text>
              </View>
              <Text style={[styles.heroCourse, { color: valueColor }]} numberOfLines={2}>
                {state.reception?.courseName ?? '（科目名不明）'}
                {updating ? '（更新中…）' : ''}
              </Text>
              {expanded ? (
                <>
                  <View style={styles.ringWrap}>
                    <CountdownRing
                      centerText={countdownText(state.reception?.confirmWindow ?? null, now) ?? state.reception?.remaining ?? '—'}
                      subText="残り時間"
                      size={172}
                    />
                  </View>
                  <Text style={[styles.heroWindow, { color: labelColor }]}>
                    出席確認時間 {state.reception?.confirmWindow ?? '—'}
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            <>
              <View style={[styles.preIconWrap, glass && styles.preIconWrapGlass]}>
                <Ionicons name="time-outline" size={30} color={glass ? c.white : c.emerald} />
              </View>
              <Text style={[styles.status, styles.statusCenter, { color: valueColor }]}>{statusLine}</Text>
            </>
          )}
        </View>

        {state.phase === 'navFailed' && !revealClass ? (
          <View style={[styles.card, cardStyle, { marginTop: 12 }]}>
            <Text style={[styles.status, { color: valueColor, fontSize: 14, fontWeight: '500' }]}>
              受付状況を取得できませんでした。「更新」で開き直します。
            </Text>
            <View style={styles.failRow}>
              <Pressable style={[styles.failBtn, { backgroundColor: c.cta }]} onPress={retry}>
                <Text style={styles.failBtnText}>更新</Text>
              </Pressable>
              {failCount >= 2 ? (
                <Pressable
                  style={[styles.failBtn, styles.failBtnGhost]}
                  onPress={() => setRevealClass(true)}
                >
                  <Text style={[styles.failBtnText, { color: c.emeraldDark }]}>CLASSの画面を表示</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={[styles.card, cardStyle, { marginTop: 12 }]}>
          <Text style={[styles.inputLabel, { color: labelColor }]}>認証コード（半角数字）</Text>
          <Pressable style={styles.segRow} onPress={() => inputRef.current?.focus()}>
            {digits.map((d, i) => (
              <View key={i} style={[styles.seg, glass && styles.segGlass]}>
                <Text style={[styles.segText, { color: valueColor }]}>{d}</Text>
              </View>
            ))}
          </Pressable>
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={code}
            onChangeText={(t) => setCode(normalizeAttendanceCode(t).slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            autoFocus={false}
          />
        </View>

        <Pressable style={[styles.cta, { backgroundColor: c.cta }]} onPress={submit}>
          <Text style={styles.ctaText}>{state.phase === 'submitting' ? '送信中…' : '出席する'}</Text>
        </Pressable>

        {resultBanner ? (
          state.result?.ok ? (
            <View style={[styles.card, cardStyle, styles.doneCard]}>
              <View style={styles.doneCheck}>
                <Ionicons name="checkmark" size={38} color="#ffffff" />
              </View>
              <Text style={[styles.doneTitle, { color: valueColor }]}>出席を登録しました</Text>
              <Text style={[styles.doneSub, { color: labelColor }]}>{resultBanner.text}</Text>
            </View>
          ) : (
            <View style={[styles.result, { backgroundColor: resultBanner.bg }]}>
              <Text style={[styles.resultText, { color: resultBanner.fg }]}>{resultBanner.text}</Text>
            </View>
          )
        ) : null}
      </ScreenBg>

      {/* 自動遷移・受付検出は常にこの非表示WebView（画面外1x1）で進める。ユーザーには基本
          CLASSの生画面を見せない。取得できない時だけ、ユーザーが明示的に「CLASSの画面を表示」を
          押した場合に限り全画面表示する（revealClass）。 */}
      <View
        style={revealClass ? styles.webviewOverlayBox : styles.webviewHiddenBox}
        pointerEvents={revealClass ? 'auto' : 'none'}
      >
        {!collectActive ? (
          <WebView
            key={webviewKey}
            ref={webviewRef}
            // キャッシュ無効＋キー毎のキャッシュバスター: SSOの302がキャッシュ再生されると
            // IdPが「過去のリクエスト」で拒否するため（ゲートと同じ対策）。
            source={{ uri: `${CLASS_URL}?litus=a${webviewKey}` }}
            cacheEnabled={false}
            userAgent={DESKTOP_UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onLoadEnd={onLoadEnd}
            onMessage={(e) => onMessage(e.nativeEvent.data)}
            style={styles.webviewFill}
          />
        ) : null}
      </View>

      {revealClass ? (
        <View style={styles.overlayBar}>
          <Text style={styles.overlayText}>CLASSの画面です。出席登録を済ませたら「閉じる」を押してください。</Text>
          <Pressable
            style={styles.overlayBtn}
            onPress={() => {
              setRevealClass(false)
              inject(DETECT_PAGE_JS)
            }}
          >
            <Text style={styles.overlayBtnText}>閉じる</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  hLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  hTitle: { fontSize: 20, fontWeight: '600' },
  pill: { fontSize: 12, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  pillGlass: { backgroundColor: 'rgba(255,255,255,0.42)', color: '#04322a' },
  pillSolid: { backgroundColor: '#d6efe4', color: '#0a6650' },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toggle: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  toggleOn: { backgroundColor: 'rgba(255,255,255,0.6)' },
  toggleText: { fontSize: 13, color: '#eafff7' },
  toggleTextOn: { color: '#04322a', fontWeight: '600' },
  card: { borderRadius: 18, padding: 16 },
  hero: { alignItems: 'center', paddingVertical: 20 },
  liveBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cta },
  liveBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.cta, letterSpacing: 0.5 },
  heroCourse: { fontSize: 17, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
  ringWrap: { marginTop: 14 },
  heroWindow: { fontSize: 12, marginTop: 14, textAlign: 'center' },
  preIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eef5f2', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  preIconWrapGlass: { backgroundColor: 'rgba(255,255,255,0.2)' },
  status: { fontSize: 16, fontWeight: '600' },
  statusCenter: { textAlign: 'center' },
  inputLabel: { fontSize: 13, marginBottom: 10 },
  segRow: { flexDirection: 'row', gap: 9 },
  seg: { flex: 1, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: '#b9ddcd', backgroundColor: '#f1f8f5', alignItems: 'center', justifyContent: 'center' },
  segGlass: { backgroundColor: 'rgba(255,255,255,0.42)', borderColor: 'rgba(255,255,255,0.7)' },
  segText: { fontSize: 24, fontWeight: '600' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 54, left: 16, right: 16, top: 40 },
  cta: { marginTop: 16, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  result: { marginTop: 12, borderRadius: 14, padding: 11 },
  resultText: { fontSize: 15, fontWeight: '600' },
  doneCard: { marginTop: 12, alignItems: 'center', paddingVertical: 22 },
  doneCheck: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  doneTitle: { fontSize: 18, fontWeight: '700' },
  doneSub: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  failRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  failBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  failBtnGhost: { backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: '#b9ddcd' },
  failBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  webviewHiddenBox: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
  webviewOverlayBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 56, backgroundColor: '#ffffff' },
  webviewFill: { flex: 1 },
  overlayBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 56, backgroundColor: '#0a6650', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  overlayText: { color: '#ffffff', fontSize: 13, flex: 1 },
  overlayBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  overlayBtnText: { color: '#ffffff', fontSize: 13 },
})
