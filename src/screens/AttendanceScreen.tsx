import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { LinearGradient } from 'expo-linear-gradient'
import {
  DESKTOP_UA,
  DETECT_ATTENDANCE_JS,
  DETECT_PAGE_JS,
  ENTER_CLASS_PC_JS,
  OPEN_ATTENDANCE_JS,
  buildSubmitAttendanceJs,
} from '../collect/injectedScripts'
import { parseAttendanceMessage } from '../collect/attendanceMessage'
import { classifyClassPage } from '../attendance/classifyClassPage'
import { normalizeAttendanceCode } from '../attendance/normalizeCode'
import {
  attendanceReducer,
  initialEngineState,
  overlayVisible,
  type SubmitResult,
} from '../attendance/engine'
import { COLORS, useThemeVariant } from '../theme'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
const NAV_TIMEOUT_MS = 8000

export default function AttendanceScreen() {
  const webviewRef = useRef<WebView>(null)
  const inputRef = useRef<TextInput>(null)
  const portalTriesRef = useRef(0)
  const { variant } = useThemeVariant()
  const glass = variant === 'glass'
  const [state, dispatch] = useReducer(attendanceReducer, initialEngineState)
  const [code, setCode] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [webviewKey, setWebviewKey] = useState(0)

  useEffect(() => {
    if (state.phase !== 'booting') return
    const t = setTimeout(() => dispatch({ kind: 'navTimeout' }), NAV_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [state.phase, webviewKey])

  // 受付状況に連動して展開/集約を自動化（受付中＝展開／受付なし＝集約）。以後は手動トグルで上書き可。
  useEffect(() => {
    if (state.reception) setExpanded(state.reception.accepting)
  }, [state.reception])

  function inject(js: string) {
    webviewRef.current?.injectJavaScript(js)
  }

  function onLoadEnd() {
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
      })
      dispatch({ kind: 'page', page: kind })
      if (kind === 'attendance') {
        portalTriesRef.current = 0
        inject(DETECT_ATTENDANCE_JS)
      } else if (kind === 'portal') {
        if (portalTriesRef.current < 3) {
          portalTriesRef.current += 1
          inject(ENTER_CLASS_PC_JS)
          setTimeout(() => inject(OPEN_ATTENDANCE_JS), 600)
        }
      }
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
    dispatch({ kind: 'retry' })
    setWebviewKey((k) => k + 1)
  }

  const isOverlay = overlayVisible(state.phase)
  const c = COLORS

  const statusLine =
    state.reception && state.reception.accepting
      ? `受付中: ${state.reception.courseName ?? ''}`
      : state.phase === 'ready'
        ? '受付中の授業はありません'
        : '受付状況を確認しています…'

  const resultBanner = state.result
    ? {
        text: state.result.result,
        bg: state.result.ok ? c.successBg : c.dangerBg,
        fg: state.result.ok ? c.success : c.danger,
      }
    : null

  const digits = [0, 1, 2, 3].map((i) => code[i] ?? '')

  const Bg = glass ? GlassBg : SolidBg

  const cardStyle = glass
    ? { backgroundColor: 'rgba(255,255,255,0.34)', borderColor: 'rgba(255,255,255,0.55)', borderWidth: 1 }
    : { backgroundColor: c.white, borderColor: '#e3ece8', borderWidth: 1 }
  const labelColor = glass ? c.labelOnGlass : c.emeraldDark
  const valueColor = glass ? c.inkOnGlass : c.ink

  return (
    <View style={styles.wrap}>
      <Bg>
        <View style={styles.header}>
          <Text style={[styles.hTitle, { color: glass ? c.white : c.emeraldDark }]}>出席</Text>
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
                <Text style={[styles.tileValue, { color: valueColor }]}>{state.reception.remaining ?? '—'}</Text>
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
      </Bg>

      <WebView
        key={webviewKey}
        ref={webviewRef}
        source={{ uri: CLASS_URL }}
        userAgent={DESKTOP_UA}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onLoadEnd={onLoadEnd}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={isOverlay ? styles.webviewOverlay : styles.webviewHidden}
      />

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

function GlassBg({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={styles.root}>
      {children}
    </LinearGradient>
  )
}

function SolidBg({ children }: { children: ReactNode }) {
  return <View style={[styles.root, { backgroundColor: COLORS.tint }]}>{children}</View>
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  root: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  hTitle: { fontSize: 20, fontWeight: '600' },
  pill: { fontSize: 12, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  pillGlass: { backgroundColor: 'rgba(255,255,255,0.42)', color: '#04322a' },
  pillSolid: { backgroundColor: '#d6efe4', color: '#0a6650' },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toggle: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  toggleOn: { backgroundColor: 'rgba(255,255,255,0.6)' },
  toggleText: { fontSize: 13, color: '#eafff7' },
  toggleTextOn: { color: '#04322a', fontWeight: '600' },
  card: { borderRadius: 16, padding: 16 },
  status: { fontSize: 16, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tile: { flex: 1, borderRadius: 12, padding: 10, backgroundColor: '#f1f8f5' },
  tileGlass: { backgroundColor: 'rgba(255,255,255,0.30)' },
  tileLabel: { fontSize: 12, marginBottom: 2 },
  tileValue: { fontSize: 15, fontWeight: '600' },
  inputLabel: { fontSize: 13, marginBottom: 10 },
  segRow: { flexDirection: 'row', gap: 9 },
  seg: { flex: 1, height: 54, borderRadius: 12, borderWidth: 1.5, borderColor: '#b9ddcd', backgroundColor: '#f1f8f5', alignItems: 'center', justifyContent: 'center' },
  segGlass: { backgroundColor: 'rgba(255,255,255,0.42)', borderColor: 'rgba(255,255,255,0.7)' },
  segText: { fontSize: 24, fontWeight: '600' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 54, left: 16, right: 16, top: 40 },
  cta: { marginTop: 16, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  result: { marginTop: 12, borderRadius: 12, padding: 11 },
  resultText: { fontSize: 15, fontWeight: '600' },
  webviewHidden: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
  webviewOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 60 },
  overlayBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, backgroundColor: '#0a6650', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  overlayText: { color: '#ffffff', fontSize: 13, flex: 1 },
  overlayBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  overlayBtnText: { color: '#ffffff', fontSize: 13 },
})
