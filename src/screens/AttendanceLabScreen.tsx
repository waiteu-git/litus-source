import { useRef, useState } from 'react'
import { Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { WebView } from 'react-native-webview'
import {
  DESKTOP_UA,
  DETECT_ATTENDANCE_JS,
  DETECT_AUTH_JS,
  ENTER_CLASS_PC_JS,
  buildAttendanceLabJs,
  type AttendanceStrategy,
} from '../collect/injectedScripts'
import { parseAttendanceMessage } from '../collect/attendanceMessage'
import { useAuth } from '../auth/AuthProvider'
import { classifyAuthState } from '../auth/classifyAuthState'

// 出席登録ボタンの発火方法だけを検証する開発用ラボ。CLASSのモバイル出席登録ページを開いた状態で、
// パターン別ボタンを押す→流し込み＋各戦略で送信→結果をログに積む。どのパターンで登録が通るかを切り分ける。
const CLASS_URL = 'https://class.admin.tus.ac.jp/'
const CLASS_ON_LOAD_JS = `${ENTER_CLASS_PC_JS}\n${DETECT_AUTH_JS}`

const STRATEGIES: { id: AttendanceStrategy; label: string }[] = [
  { id: 'onclick-yes', label: 'P1 onclick→はい' },
  { id: 'click-yes', label: 'P2 click→はい' },
  { id: 'events-yes', label: 'P3 イベント列→はい' },
  { id: 'ab-direct', label: 'P4 ab直呼び' },
  { id: 'no-modified', label: 'P5 isModified無効' },
  { id: 'widget-form', label: 'P6 widget/form' },
  { id: 'touch-click', label: 'P7 touch列' },
]

type LabMsg = {
  type?: string
  strategy?: string
  method?: string
  vals?: string
  msg?: string
  status?: string
  dialogOpen?: boolean
  hasErr?: boolean
  hasOk?: boolean
  filled?: number
  btnFound?: boolean
  hasPasswordInput?: boolean
  hasLogoutLink?: boolean
}

export default function AttendanceLabScreen() {
  const webviewRef = useRef<WebView>(null)
  const auth = useAuth()
  const [code, setCode] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [webviewKey, setWebviewKey] = useState(0)

  function addLog(line: string) {
    const stamp = new Date().toLocaleTimeString('ja-JP', { hour12: false })
    setLog((prev) => [`${stamp} ${line}`, ...prev].slice(0, 20))
  }

  function run(id: AttendanceStrategy) {
    const c = code.trim()
    if (!c) {
      addLog('認証コード未入力')
      return
    }
    webviewRef.current?.injectJavaScript(buildAttendanceLabJs(c, id))
  }

  function check() {
    webviewRef.current?.injectJavaScript(DETECT_ATTENDANCE_JS)
  }

  function reset() {
    setWebviewKey((k) => k + 1)
    auth.refresh()
    addLog('WebView再生成（最初に戻る）')
  }

  function onMessage(data: string) {
    let parsed: LabMsg | null = null
    try {
      parsed = JSON.parse(data)
    } catch {
      // 後段の parseAttendanceMessage がエラーを表現する
    }
    if (parsed && parsed.type === 'nav') return
    if (parsed && parsed.type === 'auth') {
      auth.setClass(
        classifyAuthState({
          hasPasswordInput: !!parsed.hasPasswordInput,
          hasLogoutLink: !!parsed.hasLogoutLink,
        }),
      )
      return
    }
    if (parsed && parsed.type === 'lab') {
      const label = STRATEGIES.find((s) => s.id === parsed!.strategy)?.label ?? parsed.strategy
      const verdict = parsed.hasOk
        ? '✅登録'
        : parsed.hasErr
          ? '⚠エラー'
          : parsed.dialogOpen
            ? '⏸確認ダイアログ残'
            : '要目視'
      addLog(
        `${label}: ${verdict} / m:${parsed.method ?? '-'} / val[${parsed.vals ?? ''}] / ${
          parsed.msg || parsed.status || '（メッセージなし）'
        }`,
      )
      return
    }
    // 受付状況（DETECT_ATTENDANCE_JS）
    const r = parseAttendanceMessage(data)
    if (!r.error) {
      addLog(r.accepting ? `受付中${r.courseName ? `: ${r.courseName}` : ''}` : '受付中の授業なし')
    } else {
      addLog(`受付確認: ${r.error}`)
    }
  }

  const authNote =
    auth.class === 'authenticated'
      ? 'ログイン済み'
      : auth.class === 'needsLogin'
        ? 'ログインが必要（下のWebViewでログイン）'
        : 'ログイン状態を確認中…'

  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="認証コード"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.topBtn}>
          <Button title="受付確認" onPress={check} />
        </View>
        <View style={styles.topBtn}>
          <Button title="最初に戻る" onPress={reset} />
        </View>
      </View>
      <Text style={auth.class === 'needsLogin' ? styles.authWarn : styles.authOk}>{authNote}</Text>

      <View style={styles.grid}>
        {STRATEGIES.map((s) => (
          <Pressable key={s.id} style={styles.patBtn} onPress={() => run(s.id)}>
            <Text style={styles.patBtnText}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.logBox} contentContainerStyle={styles.logContent}>
        {log.length === 0 ? (
          <Text style={styles.logEmpty}>
            出欠管理→モバイル出席登録 を開き、コードを入れて各パターンを試す。結果がここに積まれる。
          </Text>
        ) : (
          log.map((line, i) => (
            <Text key={i} style={styles.logLine}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>

      <View style={styles.webviewBox}>
        <WebView
          key={webviewKey}
          ref={webviewRef}
          source={{ uri: CLASS_URL }}
          userAgent={DESKTOP_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => webviewRef.current?.injectJavaScript(CLASS_ON_LOAD_JS)}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', padding: 8, paddingBottom: 0 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  topBtn: { paddingHorizontal: 2 },
  authOk: { paddingHorizontal: 8, paddingTop: 4, color: '#0b6b2f', fontSize: 12 },
  authWarn: { paddingHorizontal: 8, paddingTop: 4, color: '#b26a00', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 4 },
  patBtn: {
    width: '31.5%',
    margin: '1%',
    backgroundColor: '#0f9e75',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  patBtnText: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  logBox: { maxHeight: 150, backgroundColor: '#0b1f19', marginHorizontal: 8, borderRadius: 6 },
  logContent: { padding: 8 },
  logEmpty: { color: '#8fcaba', fontSize: 12 },
  logLine: { color: '#c9f5e6', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 },
  webviewBox: { flex: 1, marginTop: 8 },
})
