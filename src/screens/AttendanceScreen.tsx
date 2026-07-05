import { useRef, useState } from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { DESKTOP_UA, DETECT_ATTENDANCE_JS } from '../collect/injectedScripts'
import { parseAttendanceMessage } from '../collect/attendanceMessage'

// CLASSのJSFページは直リンク不可（セッション/ViewState無しだと保証人ポータル等へ飛ぶ）。
// 時間割収集画面と同じくCLASSトップを開き、ユーザーがログイン→出席ページへ遷移する。
const CLASS_URL = 'https://class.admin.tus.ac.jp/'

export default function AttendanceScreen() {
  const webviewRef = useRef<WebView>(null)
  const [banner, setBanner] = useState<string | null>(null)

  function check() {
    webviewRef.current?.injectJavaScript(DETECT_ATTENDANCE_JS)
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
      {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      <View style={styles.webviewBox}>
        <WebView
          ref={webviewRef}
          source={{ uri: CLASS_URL }}
          userAgent={DESKTOP_UA}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
        />
      </View>
      <View style={styles.controls}>
        <Button title="受付状況を確認" onPress={check} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  banner: { backgroundColor: '#e6f4ea', color: '#0b6b2f', padding: 10, fontWeight: '600' },
  webviewBox: { flex: 1 },
  controls: { padding: 8 },
})
