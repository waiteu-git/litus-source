import { useRef, useState } from 'react'
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { parseCollectionMessage, type CollectionResult } from '../collect/timetableMessage'
import { DESKTOP_UA, COLLECT_TIMETABLE_JS, OPEN_TIMETABLE_JS } from '../collect/injectedScripts'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
const DAY_LABEL: Record<string, string> = {
  mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土',
}

export default function TimetableCollectScreen() {
  const webviewRef = useRef<WebView>(null)
  const [result, setResult] = useState<CollectionResult | null>(null)

  function collect() {
    webviewRef.current?.injectJavaScript(COLLECT_TIMETABLE_JS)
  }

  function openTimetable() {
    webviewRef.current?.injectJavaScript(OPEN_TIMETABLE_JS)
  }

  function onMessage(data: string) {
    try {
      const parsed = JSON.parse(data)
      if (parsed && parsed.type === 'nav') return
    } catch {
      // 後段の parseCollectionMessage がエラーを表現する
    }
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
        <Button title="時間割を開く" onPress={openTimetable} />
        <Button title="収集" onPress={collect} />
      </View>
      <ScrollView style={styles.output} contentContainerStyle={styles.outputContent}>
        {result?.error ? <Text style={styles.error}>{result.error}</Text> : null}
        {result?.collections.map((c, i) => (
          <View key={i} style={styles.collection}>
            <Text style={styles.campus}>
              時間割{i + 1}（{c.slots.length}コマ）
              {c.periodTimes ? ` ・ ${c.periodTimes.campus}` : ''}
            </Text>
            {c.slots.map((s) => (
              <Text key={`${i}-${s.day}-${s.period}`} style={styles.row}>
                {DAY_LABEL[s.day]}
                {s.period}: {s.classes.map((cl) => `${cl.name}（${cl.room}）`).join(' / ')}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webviewBox: { flex: 1 },
  controls: { padding: 8 },
  output: { maxHeight: 280, borderTopWidth: 1, borderTopColor: '#ddd' },
  outputContent: { padding: 12 },
  collection: { marginBottom: 12 },
  campus: { fontWeight: '600', marginBottom: 6 },
  row: { marginBottom: 4 },
  error: { color: '#b00020', marginBottom: 6 },
})
