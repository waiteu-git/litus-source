import { useRef, useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import { WebView, type WebViewInstance } from '../ui/GuardedWebView'
import { useNavigation } from '@react-navigation/native'
import { ActionButton, StepList, useUi, type Step } from '../ui/screen'
import { DESKTOP_UA, MYCOURSES_URL, COLLECT_MYCOURSES_JS } from '../collect/injectedScripts'
import { parseMyCoursesMessage } from '../collect/myCoursesMessage'
import { buildCourseCodeMap } from '../parsers/letusCourses'
import { saveCourseMap } from '../storage/courseMapStore'

/** コース収集画面。案3bの簡易版（接続→収集・保存の2段）で統一感を持たせる。 */
export default function CollectCoursesScreen() {
  const webviewRef = useRef<WebViewInstance>(null)
  const navigation = useNavigation()
  const ui = useUi()
  const [loaded, setLoaded] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  function collect() {
    setCollecting(true)
    setError(null)
    webviewRef.current?.injectJavaScript(COLLECT_MYCOURSES_JS)
  }

  async function onMessage(data: string) {
    const r = parseMyCoursesMessage(data)
    if (r.error) {
      setCollecting(false)
      setError(r.error)
      return
    }
    try {
      await saveCourseMap(buildCourseCodeMap(r.courses))
    } catch {
      setCollecting(false)
      setError('保存に失敗しました')
      return
    }
    setCollecting(false)
    setSavedCount(r.courses.length)
    setTimeout(() => navigation.goBack(), 700)
  }

  const steps: Step[] = [
    { label: 'CLASSコース一覧に接続', state: loaded ? 'done' : 'active' },
    {
      label: 'コースを収集・保存',
      sub: error ?? (savedCount !== null ? `${savedCount} 件保存しました` : undefined),
      state: error ? 'error' : savedCount !== null ? 'done' : collecting ? 'active' : 'pending',
    },
  ]

  return (
    <View style={styles.root}>
      {ui.colors.gradient ? (
        <LinearGradient colors={ui.colors.gradient} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.webviewBox}>
        <WebView
          ref={webviewRef}
          source={{ uri: MYCOURSES_URL }}
          userAgent={DESKTOP_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => setLoaded(true)}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
        />
      </View>
      <View style={styles.panel}>
        <View style={[ui.card, styles.card]}>
          <StepList steps={steps} />
        </View>
        <ActionButton label={error ? '再試行' : 'コースを収集'} onPress={collect} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webviewBox: { flex: 1 },
  panel: { padding: 12, gap: 10 },
  card: { paddingVertical: 16 },
})
