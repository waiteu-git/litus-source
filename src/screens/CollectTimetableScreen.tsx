import { useRef, useState } from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { parseCollectionMessage } from '../collect/timetableMessage'
import {
  DESKTOP_UA,
  COLLECT_TIMETABLE_JS,
  ENTER_CLASS_PC_JS,
  OPEN_TIMETABLE_JS,
} from '../collect/injectedScripts'
import { saveTimetable } from '../storage/timetableStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import type { TimetableStackParamList } from '../navigation/types'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'

export default function CollectTimetableScreen() {
  const webviewRef = useRef<WebView>(null)
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const [error, setError] = useState<string | null>(null)

  function collect() {
    webviewRef.current?.injectJavaScript(COLLECT_TIMETABLE_JS)
  }

  function openTimetable() {
    webviewRef.current?.injectJavaScript(OPEN_TIMETABLE_JS)
  }

  async function onMessage(data: string) {
    try {
      const parsed = JSON.parse(data)
      if (parsed && parsed.type === 'nav') return
    } catch {
      // 後段の parseCollectionMessage がエラーを表現する
    }
    const result = parseCollectionMessage(data)
    if (!result.error && result.collections.length > 0) {
      try {
        await saveTimetable(result.collections)
        await refreshAllNotifications()
      } catch {
        setError('保存に失敗しました')
        return
      }
      setError(null)
      navigation.goBack()
      return
    }
    setError(result.error ?? '収集できませんでした')
  }

  return (
    <View style={styles.root}>
      <View style={styles.webviewBox}>
        <WebView
          ref={webviewRef}
          source={{ uri: CLASS_URL }}
          userAgent={DESKTOP_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => webviewRef.current?.injectJavaScript(ENTER_CLASS_PC_JS)}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
        />
      </View>
      <View style={styles.controls}>
        <Button title="時間割を開く" onPress={openTimetable} />
        <Button title="収集" onPress={collect} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webviewBox: { flex: 1 },
  controls: { padding: 8 },
  error: { color: '#b00020', padding: 8 },
})
