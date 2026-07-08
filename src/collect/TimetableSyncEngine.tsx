import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import {
  DESKTOP_UA,
  COLLECT_TIMETABLE_JS,
  DETECT_AUTH_JS,
  ENTER_CLASS_PC_JS,
  OPEN_TIMETABLE_JS,
} from './injectedScripts'
import { parseCollectionMessage } from './timetableMessage'
import { saveTimetable } from '../storage/timetableStore'
import { saveTimetableRefreshedAt } from '../storage/refreshMetaStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { useClassView } from './classViewArbiter'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
const CLASS_ON_LOAD_JS = `${ENTER_CLASS_PC_JS}\n${DETECT_AUTH_JS}`
// 非表示WebViewでの収集全体のハング保険。
const OVERALL_TIMEOUT_MS = 25000
// ページ読込後に時間割メニュー→抽出を試みるまでの待ち。
const OPEN_DELAY_MS = 1200
const COLLECT_DELAY_MS = 2600
// 時間割ページに未到達（0件）時の再試行上限。
const MAX_TRIES = 3

/**
 * CLASS時間割の headless 収集エンジン。非表示WebViewで CLASS を開き、PC自動入場→時間割メニュー→
 * テーブル抽出を自動実行して保存する（CollectTimetableScreen の可視フローを裏で行う版）。
 * 実行中は classViewArbiter の使用権を取り、出席の持続WebViewに譲らせる（CLASS単一セッション保護）。
 * 成否に関わらず onFinished を1回だけ呼ぶ。
 */
export default function TimetableSyncEngine({ onFinished }: { onFinished: () => void }) {
  const webviewRef = useRef<WebView>(null)
  const { setCollectActive } = useClassView()
  const triesRef = useRef(0)
  const doneRef = useRef(false)
  const [nonce, setNonce] = useState(0)

  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    setCollectActive(false)
    onFinished()
  }

  useEffect(() => {
    setCollectActive(true) // CLASS使用権を取り出席に譲らせる
    const t = setTimeout(finish, OVERALL_TIMEOUT_MS)
    return () => {
      clearTimeout(t)
      setCollectActive(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onLoadEnd() {
    webviewRef.current?.injectJavaScript(CLASS_ON_LOAD_JS)
    setTimeout(() => webviewRef.current?.injectJavaScript(OPEN_TIMETABLE_JS), OPEN_DELAY_MS)
    setTimeout(() => webviewRef.current?.injectJavaScript(COLLECT_TIMETABLE_JS), COLLECT_DELAY_MS)
  }

  async function onMessage(data: string) {
    let p: { type?: string } | null = null
    try {
      p = JSON.parse(data)
    } catch {
      p = null
    }
    if (p && (p.type === 'nav' || p.type === 'auth')) return
    const result = parseCollectionMessage(data)
    if (!result.error && result.collections.length > 0) {
      try {
        await saveTimetable(result.collections)
        await saveTimetableRefreshedAt()
        await refreshAllNotifications()
      } catch {
        // 保存失敗でも終了（次回再試行）
      }
      finish()
      return
    }
    // 未到達（0件）→ メニュー再発火。上限で諦める。
    if (triesRef.current < MAX_TRIES) {
      triesRef.current += 1
      webviewRef.current?.injectJavaScript(OPEN_TIMETABLE_JS)
      setTimeout(() => webviewRef.current?.injectJavaScript(COLLECT_TIMETABLE_JS), COLLECT_DELAY_MS)
    } else {
      finish()
    }
  }

  return (
    <View style={styles.box} pointerEvents="none">
      <WebView
        key={nonce}
        ref={webviewRef}
        source={{ uri: CLASS_URL }}
        cacheEnabled={false}
        userAgent={DESKTOP_UA}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onLoadEnd={onLoadEnd}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        onError={() => setNonce((n) => n + 1)}
        style={styles.web}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
  web: { width: 1, height: 1 },
})
