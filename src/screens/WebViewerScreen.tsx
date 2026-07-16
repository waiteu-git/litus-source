import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { WebView } from 'react-native-webview'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AssignmentsStackParamList } from '../navigation/types'
import {
  COLLECT_ASSIGNMENT_PAGE_JS,
  INJECT_COURSE_ADD_BUTTONS_JS,
  isAssignmentPageUrl,
  isCoursePageUrl,
  isDownloadableFileUrl,
  isPdfLikeUrl,
  markActivityAddedJs,
} from '../collect/injectedScripts'
import { notifyWidgetDataChanged } from '../widget/updateWidget'
import { parseAssignmentPage } from '../parsers/letus'
import { upsertAssignments, type CollectedAssignment } from '../updates/assignmentUpsert'
import { loadAssignments, mutateAssignments, upsertAssignment } from '../storage/assignmentsStore'
import { isSameTrackedActivity } from '../updates/letusActivityKey'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { useAssignmentsVersion } from '../assignments/assignmentsVersion'
import { isCollectedAssignmentUrl } from '../assignments/assignmentOwnership'
import { makeUserManagedActivity } from '../assignments/manualAssignment'
import AddActivityDeadlineSheet from '../assignments/AddActivityDeadlineSheet'
import { COLORS, DARK } from '../theme'
import { useUi } from '../ui/screen'

type Params = { Web: { url: string; title?: string } }

/**
 * アプリ内WebViewビューア。シラバス・LETUSコース・課題ページなどを外部ブラウザに出さず
 * アプリ内で表示する（Cookie共有なのでSSOログイン済みのまま開ける）。
 * - 課題ページ: 未追跡なら「この課題を追加」ボタン（既に追跡中なら出さない）。
 * - コースページ: 各アクティビティ（ファイル/フォーラム/課題等）の隣に「＋追加」ボタンを注入。
 * - ファイル(PDF等)リンク: タップ即ダウンロードを抑止（アプリ内表示はv9で対応）。
 */
export default function WebViewerScreen() {
  const route = useRoute<RouteProp<Params, 'Web'>>()
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const { url, title } = route.params
  const ui = useUi()
  const webviewRef = useRef<WebView>(null)
  const { bump } = useAssignmentsVersion()
  const [currentUrl, setCurrentUrl] = useState(url)
  const [toast, setToast] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [trackedUrls, setTrackedUrls] = useState<string[]>([])
  const [pending, setPending] = useState<{ url: string; title: string; courseName: string } | null>(null)

  useEffect(() => {
    loadAssignments()
      .then((m) => setTrackedUrls(Object.keys(m)))
      .catch(() => undefined)
  }, [])

  // 課題ページかつ未追跡のときだけ「この課題を追加」を出す（既知課題では出さない）。
  const canAdd = isAssignmentPageUrl(currentUrl) && !isSameTrackedActivity(currentUrl, trackedUrls)

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function requestAdd() {
    setAdding(true)
    webviewRef.current?.injectJavaScript(COLLECT_ASSIGNMENT_PAGE_JS)
  }

  async function addOne(a: CollectedAssignment, okMsg: string) {
    try {
      const merged = await mutateAssignments((existing) => upsertAssignments(existing, [a], new Date()))
      setTrackedUrls(Object.keys(merged))
      await refreshAllNotifications()
      notifyWidgetDataChanged()
      bump()
      // 追加が確定してからコースページの「＋追加」ボタンを「追加済み」へ（楽観反映はしない）。
      webviewRef.current?.injectJavaScript(markActivityAddedJs(a.url))
      flash(okMsg)
    } catch {
      flash('追加に失敗しました')
    }
  }

  async function onMessage(data: string) {
    let p: { type?: string; html?: string; url?: string; courseName?: string; title?: string; mod?: string }
    try {
      p = JSON.parse(data)
    } catch {
      setAdding(false)
      return
    }
    if (p.type === 'assignmentpage' && typeof p.html === 'string') {
      const pageUrl = typeof p.url === 'string' ? p.url : currentUrl
      const parsed = parseAssignmentPage(p.html, pageUrl)
      await addOne(
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
        '課題を追加しました',
      )
      setAdding(false)
      return
    }
    if (p.type === 'addActivity' && typeof p.url === 'string') {
      const activityUrl = p.url
      const activityTitle = p.title || '（無題）'
      const activityCourse = p.courseName ?? title ?? ''
      if (trackedUrls.includes(activityUrl)) {
        // 追跡済み: 何も追加せず表示だけ揃える。
        webviewRef.current?.injectJavaScript(markActivityAddedJs(activityUrl))
        flash('すでに追加されています')
        return
      }
      if (isCollectedAssignmentUrl(activityUrl)) {
        // 収集対象: 確認してから追加（締切等は次回収集で補完される）。
        // 旧実装の無確認即追加は、誤タップ時に取り消す手段がなかった。
        Alert.alert(`「${activityTitle}」を追加しますか？`, activityCourse || undefined, [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '追加',
            onPress: () => {
              void addOne(
                {
                  url: activityUrl, courseCode: null, courseName: activityCourse,
                  title: activityTitle, deadline: null, deadlineText: '',
                  submissionStatus: 'unknown', lifecycleStatus: 'active',
                },
                `「${p.title || '項目'}」を追加しました`,
              )
            },
          },
        ])
      } else {
        // 収集対象外(PDF resource等): 締切ボトムシートを開いてユーザー所有で追加。
        setPending({ url: activityUrl, title: activityTitle, courseName: activityCourse })
      }
      return
    }
    if (p.type === 'courseButtons') {
      // ボタン注入完了: 追跡済みURLの「＋追加」を「追加済み」表示に復元する（再読込で消えないように）。
      if (trackedUrls.length > 0) {
        webviewRef.current?.injectJavaScript(trackedUrls.map((u) => markActivityAddedJs(u)).join('\n'))
      }
      return
    }
    setAdding(false)
  }

  // pending を確定保存するハンドラ（シートの保存/スキップから呼ばれる）。
  async function commitPending(deadline: string | null) {
    if (!pending) return
    const committed = pending
    try {
      await upsertAssignment(makeUserManagedActivity({ ...committed, deadline }, new Date().toISOString()))
      setTrackedUrls(await loadAssignments().then((m) => Object.keys(m)))
      await refreshAllNotifications()
      notifyWidgetDataChanged()
      bump()
      webviewRef.current?.injectJavaScript(markActivityAddedJs(committed.url))
      flash(`「${committed.title}」を追加しました`)
    } catch {
      flash('追加に失敗しました')
    } finally {
      setPending(null)
    }
  }

  function onLoadEnd() {
    if (isCoursePageUrl(currentUrl)) {
      webviewRef.current?.injectJavaScript(INJECT_COURSE_ADD_BUTTONS_JS)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: ui.colors.screenSolid }]}>
      <WebView
        ref={webviewRef}
        source={{ uri: url }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onNavigationStateChange={(s) => setCurrentUrl(s.url)}
        onLoadEnd={onLoadEnd}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        onShouldStartLoadWithRequest={(req) => {
          // PDFはアプリ内pdf.jsビューアで開く（同一オリジンfetch＋canvas描画・ログイン維持）。
          if (isPdfLikeUrl(req.url)) {
            navigation.navigate('PdfViewer', { url: req.url, title })
            return false
          }
          // PDF以外のファイル(docx/zip等)は即ダウンロードを抑止（アプリ内表示は非対応）。
          if (isDownloadableFileUrl(req.url)) {
            flash('このファイル形式はアプリ内表示に非対応です（自動ダウンロードは抑止しました）')
            return false
          }
          return true
        }}
        style={styles.web}
      />
      {canAdd ? (
        <Pressable style={[styles.fab, { shadowColor: COLORS.emeraldDark }]} onPress={requestAdd} disabled={adding}>
          <Text style={[styles.fabText, { color: COLORS.white }]}>{adding ? '追加中…' : '＋ この課題を追加'}</Text>
        </Pressable>
      ) : null}
      {toast ? (
        <View style={[styles.toast, { backgroundColor: ui.pick(COLORS.emeraldDeep, COLORS.inkOnGlass, DARK.card) }]}>
          <Text style={[styles.toastText, { color: COLORS.white }]}>{toast}</Text>
        </View>
      ) : null}
      <AddActivityDeadlineSheet
        visible={pending !== null}
        presetTitle={pending?.title ?? ''}
        presetCourseName={pending?.courseName ?? ''}
        onSave={commitPending}
        onSkip={() => commitPending(null)}
        onCancel={() => setPending(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { fontSize: 14, fontWeight: '700' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 76,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  toastText: { fontSize: 14 },
})
