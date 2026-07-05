import { useRef, useState } from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { DESKTOP_UA, DETECT_ATTENDANCE_JS } from '../collect/injectedScripts'
import { parseAttendanceMessage } from '../collect/attendanceMessage'

// CLASSのJSFページは直リンク不可（ViewState無しだと保証人ポータルへ飛び詰まる）。
// メニューの .click() 自動遷移も不安定なため、CLASSトップを開いてユーザーが手動で
// 「出欠管理」→「モバイル出席登録」へ進む。到達後に「受付状況を確認」で受付状態を判定する。
const CLASS_URL = 'https://class.admin.tus.ac.jp/'

export default function AttendanceScreen() {
  const webviewRef = useRef<WebView>(null)
  const [banner, setBanner] = useState<string | null>(null)
  // key を変えると WebView を作り直してCLASSトップから再開する（詰まりからの確実な復帰）。
  const [webviewKey, setWebviewKey] = useState(0)

  function check() {
    webviewRef.current?.injectJavaScript(DETECT_ATTENDANCE_JS)
  }

  function reset() {
    setBanner(null)
    setWebviewKey((k) => k + 1)
  }

  function onMessage(data: string) {
    const r = parseAttendanceMessage(data)
    if (r.error) {
      setBanner(r.error)
      return
    }
    setBanner(
      r.accepting
        ? `受付中: ${r.courseName ?? ''}（コードを入力してください）`
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
      <Text style={styles.hint}>ログイン後、出欠管理 → モバイル出席登録 を開いて「受付状況を確認」</Text>
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
  bar: { flexDirection: 'row', padding: 8 },
  btn: { flex: 1, paddingHorizontal: 4 },
  hint: { paddingHorizontal: 8, paddingBottom: 6, color: '#666', fontSize: 12 },
  banner: { backgroundColor: '#e6f4ea', color: '#0b6b2f', padding: 10, fontWeight: '600' },
  webviewBox: { flex: 1 },
})
