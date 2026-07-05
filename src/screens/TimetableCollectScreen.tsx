import { useRef, useState } from 'react'
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { parseCollectionMessage, type TimetableCollection } from '../collect/timetableMessage'
import { DESKTOP_UA, EXTRACT_TIMETABLE_JS } from '../collect/injectedScripts'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
const DAY_LABEL: Record<string, string> = {
  mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土',
}

export default function TimetableCollectScreen() {
  const webviewRef = useRef<WebView>(null)
  const [result, setResult] = useState<TimetableCollection | null>(null)

  function collect() {
    webviewRef.current?.injectJavaScript(EXTRACT_TIMETABLE_JS)
  }

  function onMessage(data: string) {
    setResult(parseCollectionMessage(data))
  }

  return (
    <View style={styles.root}>
      <View style={styles.webviewBox}>
        <WebView
          ref={webviewRef}
          source={{ uri: CLASS_URL }}
          userAgent={DESKTOP_UA}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
        />
      </View>
      <View style={styles.controls}>
        <Button title="収集" onPress={collect} />
      </View>
      <ScrollView style={styles.output} contentContainerStyle={styles.outputContent}>
        {result?.error ? <Text style={styles.error}>{result.error}</Text> : null}
        {result?.periodTimes ? (
          <Text style={styles.campus}>キャンパス: {result.periodTimes.campus}</Text>
        ) : null}
        {result?.slots.map((s) => (
          <Text key={`${s.day}-${s.period}`} style={styles.row}>
            {DAY_LABEL[s.day]}
            {s.period}: {s.classes.map((c) => `${c.name}（${c.room}）`).join(' / ')}
          </Text>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webviewBox: { flex: 1 },
  controls: { padding: 8 },
  output: { maxHeight: 220, borderTopWidth: 1, borderTopColor: '#ddd' },
  outputContent: { padding: 12 },
  campus: { fontWeight: '600', marginBottom: 6 },
  row: { marginBottom: 4 },
  error: { color: '#b00020', marginBottom: 6 },
})
