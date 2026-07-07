import { useEffect, useReducer, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { WebView } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import { ScreenBg } from '../ui/screen'
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
import { countdownText } from '../attendance/countdown'
import { normalizeAttendanceCode } from '../attendance/normalizeCode'
import {
  attendanceReducer,
  initialEngineState,
  overlayVisible,
  type EnginePhase,
  type SubmitResult,
} from '../attendance/engine'
import { COLORS, useThemeVariant } from '../theme'

// 入口スプラッシュを踏まずPC側SSOへ直行（再訪時の遷移を1ホップ短縮。スプラッシュ処理は保険で残す）。
const CLASS_URL = CLASS_PC_LOGIN_URL
// 自動遷移が進んでいる間はオーバーレイを出さないよう、ページ読込ごとにこの秒数へ再アームする。
const NAV_TIMEOUT_MS = 10000

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
  const glass = variant === 'glass'
  const loginGate = useLoginGate()
  // CLASSは同一セッションの複数画面を禁止するため、このタブがフォーカス中のみWebViewをマウント
  // する（アプリ内のCLASS viewを常に最大1枚に保つ）。他画面から戻ると自動遷移が再走する。
  const isFocused = useIsFocused()
  const firstFocusRef = useRef(true)
  const [state, dispatch] = useReducer(attendanceReducer, initialEngineState)
  const [code, setCode] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [webviewKey, setWebviewKey] = useState(0)
  const [now, setNow] = useState(() => new Date())

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

  // タブ再訪でWebViewが再マウントされる際、エンジンを booting に戻す（reception は保持して
  // キャッシュ表示）。初回マウントは初期状態が booting なので何もしない。
  useEffect(() => {
    if (!isFocused) return
    if (firstFocusRef.current) {
      firstFocusRef.current = false
      return
    }
    portalTriesRef.current = 0
    errorRetryRef.current = 0
    dispatch({ kind: 'reboot' })
  }, [isFocused])

  // フォアグラウンド復帰時にページを再判定する（長時間放置でセッション切れ/古いページのまま
  // 固まるのを防ぐ）。送信中はWebView状態を壊さないようスキップ。判定結果は通常の onMessage
  // 経路に乗る（login→ゲート、portal→自動遷移、error→自動復帰）。
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && phaseRef.current !== 'submitting') {
        webviewRef.current?.injectJavaScript(DETECT_PAGE_JS)
      }
    })
    return () => sub.remove()
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
        }
      } else if (kind === 'error') {
        // JSFのViewExpired等。1回だけWebViewを作り直して自動復帰、ダメなら手動オーバーレイへ。
        if (errorRetryRef.current < 1) {
          errorRetryRef.current += 1
          portalTriesRef.current = 0
          dispatch({ kind: 'retry' })
          setWebviewKey((k) => k + 1)
        } else {
          dispatch({ kind: 'errorPage' })
        }
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
    dispatch({ kind: 'retry' })
    setWebviewKey((k) => k + 1)
  }

  const isOverlay = overlayVisible(state.phase)
  const c = COLORS

  // booting中でも前回の受付状況をキャッシュ表示し、裏の再遷移を待たせない（（更新中…）を添える）。
  const updating = state.phase === 'booting' && state.reception != null
  const statusLine =
    state.reception && state.reception.accepting
      ? `受付中: ${state.reception.courseName ?? ''}${updating ? '（更新中…）' : ''}`
      : state.phase === 'ready'
        ? '受付中の授業はありません'
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

        <View style={[styles.card, cardStyle]}>
          <Text style={[styles.status, { color: valueColor }]}>{statusLine}</Text>
          {expanded && state.reception?.accepting ? (
            <View style={styles.tiles}>
              <View style={[styles.tile, glass && styles.tileGlass]}>
                <Text style={[styles.tileLabel, { color: labelColor }]}>出席確認時間</Text>
                <Text style={[styles.tileValue, { color: valueColor }]}>{state.reception.confirmWindow ?? '—'}</Text>
              </View>
              <View style={[styles.tile, glass && styles.tileGlass]}>
                <Text style={[styles.tileLabel, { color: labelColor }]}>残り時間</Text>
                <Text style={[styles.tileValue, { color: valueColor }]}>
                  {countdownText(state.reception.confirmWindow, now) ?? state.reception.remaining ?? '—'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

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
          <View style={[styles.result, { backgroundColor: resultBanner.bg }]}>
            <Text style={[styles.resultText, { color: resultBanner.fg }]}>{resultBanner.text}</Text>
          </View>
        ) : null}
      </ScreenBg>

      {/* WebViewに直接absoluteを当てても効かず画面を占有するため、位置指定した親Viewで包む。
          非表示時は画面外1x1、オーバーレイ時のみ全画面に出す。 */}
      <View
        style={isOverlay ? styles.webviewOverlayBox : styles.webviewHiddenBox}
        pointerEvents={isOverlay ? 'auto' : 'none'}
      >
        {isFocused ? (
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

      {isOverlay ? (
        <View style={styles.overlayBar}>
          <Text style={styles.overlayText}>
            {state.phase === 'needsLogin' ? '初回のみログインしてください' : '画面を進めてください（自動で戻ります）'}
          </Text>
          <Pressable style={styles.overlayBtn} onPress={retry}>
            <Text style={styles.overlayBtnText}>やり直す</Text>
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
  status: { fontSize: 16, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tile: { flex: 1, borderRadius: 14, padding: 10, backgroundColor: '#f1f8f5' },
  tileGlass: { backgroundColor: 'rgba(255,255,255,0.30)' },
  tileLabel: { fontSize: 12, marginBottom: 2 },
  tileValue: { fontSize: 15, fontWeight: '600' },
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
  webviewHiddenBox: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
  webviewOverlayBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 56, backgroundColor: '#ffffff' },
  webviewFill: { flex: 1 },
  overlayBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 56, backgroundColor: '#0a6650', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  overlayText: { color: '#ffffff', fontSize: 13, flex: 1 },
  overlayBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  overlayBtnText: { color: '#ffffff', fontSize: 13 },
})
