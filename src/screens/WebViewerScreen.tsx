import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useRoute, type RouteProp } from '@react-navigation/native'
import {
  COLLECT_ASSIGNMENT_PAGE_JS,
  isAssignmentPageUrl,
} from '../collect/injectedScripts'
import { parseAssignmentPage } from '../parsers/letus'
import { upsertAssignments } from '../updates/assignmentUpsert'
import { loadAssignments, saveAssignments } from '../storage/assignmentsStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'
import { COLORS } from '../theme'

type Params = { Web: { url: string; title?: string } }

/**
 * アプリ内WebViewビューア。シラバス・LETUSコース・課題ページなどを外部ブラウザに出さず
 * アプリ内で表示する（Cookie共有なのでSSOログイン済みのまま開ける）。
 * 課題ページを開いているときは「この課題を追加」ボタンを出し、現ページを解析して手動で
 * 追跡対象に加えられる（カレンダー先読みで漏れた課題の補完）。
 */
export default function WebViewerScreen() {
  const route = useRoute<RouteProp<Params, 'Web'>>()
  const { url, title } = route.params
  const webviewRef = useRef<WebView>(null)
  const { bump } = useAssignmentsVersion()
  const [currentUrl, setCurrentUrl] = useState(url)
  const [toast, setToast] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const canAdd = isAssignmentPageUrl(currentUrl)

  function requestAdd() {
    setAdding(true)
    webviewRef.current?.injectJavaScript(COLLECT_ASSIGNMENT_PAGE_JS)
  }

  async function onMessage(data: string) {
    let p: { type?: string; html?: string; url?: string; courseName?: string }
    try {
      p = JSON.parse(data)
    } catch {
      setAdding(false)
      return
    }
    if (p.type !== 'assignmentpage' || typeof p.html !== 'string') {
      setAdding(false)
      return
    }
    const pageUrl = typeof p.url === 'string' ? p.url : currentUrl
    const parsed = parseAssignmentPage(p.html, pageUrl)
    try {
      const existing = await loadAssignments()
      await saveAssignments(
        upsertAssignments(
          existing,
          [
            {
              url: pageUrl,
              courseCode: null,
              courseName: p.courseName ?? title ?? '',
              title: title ?? p.courseName ?? '課題',
              deadline: parsed.deadline,
              deadlineText: '',
              submissionStatus: parsed.submissionStatus,
              lifecycleStatus: parsed.lifecycleStatus,
            },
          ],
          new Date(),
        ),
      )
      await refreshAllNotifications()
      bump()
      setToast('課題を追加しました')
    } catch {
      setToast('追加に失敗しました')
    } finally {
      setAdding(false)
      setTimeout(() => setToast(null), 2500)
    }
  }

  return (
    <View style={styles.root}>
      <WebView
        ref={webviewRef}
        source={{ uri: url }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onNavigationStateChange={(s) => setCurrentUrl(s.url)}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={styles.web}
      />
      {canAdd ? (
        <Pressable style={styles.fab} onPress={requestAdd} disabled={adding}>
          <Text style={styles.fabText}>{adding ? '追加中…' : '＋ この課題を追加'}</Text>
        </Pressable>
      ) : null}
      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    backgroundColor: COLORS.cta,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: '#0a6650',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 76,
    backgroundColor: '#04322a',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  toastText: { color: '#ffffff', fontSize: 14 },
})
