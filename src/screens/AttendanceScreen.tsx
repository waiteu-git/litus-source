import { useRef, useState } from 'react'
import { Button, StyleSheet, Text, TextInput, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { DESKTOP_UA, DETECT_ATTENDANCE_JS, buildSubmitAttendanceJs } from '../collect/injectedScripts'
import { parseAttendanceMessage } from '../collect/attendanceMessage'

// CLASSのJSFページは直リンク不可（ViewState無しだと保証人ポータルへ飛び詰まる）。
// CLASSトップを開いてユーザーが手動で「出欠管理」→「モバイル出席登録」へ進む。
// 到達後、上のコード欄に認証コードを入れて「出席する」でWebView内フォームへ流し込み送信する。
const CLASS_URL = 'https://class.admin.tus.ac.jp/'

type FillDiag = {
  type?: string
  inputCount?: number
  filled?: number
  values?: string[]
}

export default function AttendanceScreen() {
  const webviewRef = useRef<WebView>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [code, setCode] = useState('')
  // key を変えると WebView を作り直してCLASSトップから再開する（詰まりからの確実な復帰）。
  const [webviewKey, setWebviewKey] = useState(0)

  function check() {
    webviewRef.current?.injectJavaScript(DETECT_ATTENDANCE_JS)
  }

  function fill() {
    const c = code.trim()
    if (!c) {
      setBanner('認証コードを入力してください')
      return
    }
    webviewRef.current?.injectJavaScript(buildSubmitAttendanceJs(c))
  }

  function reset() {
    setBanner(null)
    setWebviewKey((k) => k + 1)
  }

  function onMessage(data: string) {
    let parsed: FillDiag | null = null
    try {
      parsed = JSON.parse(data)
    } catch {
      // 後段の parseAttendanceMessage がエラーを表現する
    }
    if (parsed && parsed.type === 'fill') {
      const vals = parsed.values ? parsed.values.join(',') : ''
      setBanner(
        `入力: 欄${parsed.inputCount ?? 0}個 / 値[${vals}] → 下の「出席登録する」を押してください`,
      )
      return
    }
    const r = parseAttendanceMessage(data)
    if (r.error) {
      setBanner(r.error)
      return
    }
    const name = r.courseName ?? ''
    setBanner(
      r.accepting
        ? `受付中${name && name.length <= 40 ? `: ${name}` : ''}（コードを入れて「出席する」）`
        : '受付中の授業はありません',
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <View style={styles.btn}>
          <Button title="受付状況を確認" onPress={check} />
        </View>
        <View style={styles.btn}>
          <Button title="最初に戻る" onPress={reset} />
        </View>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="認証コード"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        <View style={styles.btn}>
          <Button title="コードを入れる" onPress={fill} />
        </View>
      </View>
      <Text style={styles.hint}>
        出欠管理→モバイル出席登録 を開き、コードを入れて「コードを入れる」→ 下の「出席登録する」を押す
      </Text>
      {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      <View style={styles.webviewBox}>
        <WebView
          key={webviewKey}
          ref={webviewRef}
          source={{ uri: CLASS_URL }}
          userAgent={DESKTOP_UA}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', padding: 8, paddingBottom: 0 },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  btn: { flex: 1, paddingHorizontal: 4 },
  hint: { paddingHorizontal: 8, paddingBottom: 6, color: '#666', fontSize: 12 },
  banner: { backgroundColor: '#e6f4ea', color: '#0b6b2f', padding: 10, fontWeight: '600' },
  webviewBox: { flex: 1 },
})
