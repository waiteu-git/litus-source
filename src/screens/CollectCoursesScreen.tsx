import { useRef, useState } from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useNavigation } from '@react-navigation/native'
import { MYCOURSES_URL, COLLECT_MYCOURSES_JS } from '../collect/injectedScripts'
import { parseMyCoursesMessage } from '../collect/myCoursesMessage'
import { buildCourseCodeMap } from '../parsers/letusCourses'
import { saveCourseMap } from '../storage/courseMapStore'

export default function CollectCoursesScreen() {
  const webviewRef = useRef<WebView>(null)
  const navigation = useNavigation()
  const [status, setStatus] = useState<string | null>(null)

  function collect() {
    webviewRef.current?.injectJavaScript(COLLECT_MYCOURSES_JS)
  }

  async function onMessage(data: string) {
    const r = parseMyCoursesMessage(data)
    if (r.error) {
      setStatus(r.error)
      return
    }
    try {
      await saveCourseMap(buildCourseCodeMap(r.courses))
    } catch {
      setStatus('保存に失敗しました')
      return
    }
    setStatus(`${r.courses.length}件のコースを保存しました`)
    navigation.goBack()
  }

  return (
    <View style={styles.root}>
      <View style={styles.webviewBox}>
        <WebView
          ref={webviewRef}
          source={{ uri: MYCOURSES_URL }}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onMessage={(e) => onMessage(e.nativeEvent.data)}
        />
      </View>
      <View style={styles.controls}>
        <Button title="コースを収集" onPress={collect} />
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webviewBox: { flex: 1 },
  controls: { padding: 8 },
  status: { padding: 8, color: '#333' },
})
