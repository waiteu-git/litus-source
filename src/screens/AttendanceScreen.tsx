import { useCallback, useRef, useState } from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useFocusEffect } from '@react-navigation/native'
import { DESKTOP_UA, ATTENDANCE_URL, DETECT_ATTENDANCE_JS } from '../collect/injectedScripts'
import { parseAttendanceMessage } from '../collect/attendanceMessage'

export default function AttendanceScreen() {
  const webviewRef = useRef<WebView>(null)
  const [ready, setReady] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const check = useCallback(() => {
    webviewRef.current?.injectJavaScript(DETECT_ATTENDANCE_JS)
  }, [])

  // 層2: 画面を開いた時にその場で受付状況をチェック。
  useFocusEffect(
    useCallback(() => {
      if (ready) check()
    }, [ready, check]),
  )

  function onMessage(data: string) {
    const r = parseAttendanceMessage(data)
    if (r.error) {
      setBanner(r.error)
      return
    }
    setBanner(r.accepting ? `受付中: ${r.courseName ?? ''}（コードを入力してください）` : '受付中の授業はありません')
  }

  return (
    <View style={styles.root}>
      {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      <View style={styles.webviewBox}>
        <WebView
          ref={webviewRef}
          source={{ uri: ATTENDANCE_URL }}
          userAgent={DESKTOP_UA}
          onLoadEnd={() => setReady(true)}
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
