import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import {
  DESKTOP_UA,
  COLLECT_BULLETIN_JS,
  DETECT_AUTH_JS,
  ENTER_CLASS_PC_JS,
  OPEN_BULLETIN_JS,
} from './injectedScripts'
import { parseBulletinList, toBulletinDigest } from '../parsers/bulletin'
import { saveBulletinDigest } from '../storage/bulletinDigestStore'
import { saveBulletinRefreshedAt } from '../storage/refreshMetaStore'
import { useClassView } from './classViewArbiter'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
const CLASS_ON_LOAD_JS = `${ENTER_CLASS_PC_JS}\n${DETECT_AUTH_JS}`
// 非表示WebViewでの収集全体のハング保険。
const OVERALL_TIMEOUT_MS = 25000
// ページ読込後に掲示板メニュー発火→抽出を試みるまでの待ち。
const OPEN_DELAY_MS = 1200
const COLLECT_DELAY_MS = 2600
// 掲示板ページに未到達（0件）時の再試行上限。
const MAX_TRIES = 3

/**
 * CLASS掲示一覧の headless 収集エンジン（TimetableSyncEngine と同型）。非表示WebViewで CLASS を開き、
 * PC自動入場→**掲示板メニュー発火(OPEN_BULLETIN)→dl.keiji 抽出** を毎ページ読込ごとに繰り返す。
 * 着地ページはログイン時刻で変わる（アンケート/ホーム/授業中は出席）ため、着地に頼らず**常設メニューから
 * 必ず遷移**するのが要点（生URLの深リンクはJSFで弾かれるため使わない）。
 * 実行中は classViewArbiter の使用権を取り、出席の持続WebViewに譲らせる（CLASS単一セッション保護）。
 * dl.keiji を1件以上取れた時だけ保存し、取れない時は既存ダイジェストを消さない。onFinished は1回だけ。
 */
export default function BulletinSyncEngine({ onFinished }: { onFinished: () => void }) {
  const webviewRef = useRef<WebView>(null)
  const { setCollectActive, attendanceFocused } = useClassView()
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
    // 出席が前面ならCLASSに触らず即終了（出席が絶対優先）。
    if (attendanceFocused) {
      finish()
      return
    }
    setCollectActive(true) // CLASS使用権を取り出席に譲らせる
    const t = setTimeout(finish, OVERALL_TIMEOUT_MS)
    return () => {
      clearTimeout(t)
      setCollectActive(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 収集中に出席タブが開かれたら即中断してCLASSを明け渡す。
  useEffect(() => {
    if (attendanceFocused) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceFocused])

  function openThenCollect() {
    webviewRef.current?.injectJavaScript(OPEN_BULLETIN_JS)
    setTimeout(() => webviewRef.current?.injectJavaScript(COLLECT_BULLETIN_JS), COLLECT_DELAY_MS)
  }

  function onLoadEnd() {
    // 入口スプラッシュならPC ENTERで先へ。ログイン後は掲示板メニューを叩いて掲示一覧へ。
    webviewRef.current?.injectJavaScript(CLASS_ON_LOAD_JS)
    setTimeout(() => webviewRef.current?.injectJavaScript(OPEN_BULLETIN_JS), OPEN_DELAY_MS)
    setTimeout(() => webviewRef.current?.injectJavaScript(COLLECT_BULLETIN_JS), COLLECT_DELAY_MS)
  }

  async function onMessage(data: string) {
    let p: { type?: string; html?: string; count?: number } | null = null
    try {
      p = JSON.parse(data)
    } catch {
      return
    }
    if (!p || p.type === 'nav' || p.type === 'auth') return
    if (p.type !== 'bulletin') return
    // dl.keiji を1件以上取れた＝掲示板ページに到達。抽出して保存。
    if (typeof p.count === 'number' && p.count > 0 && typeof p.html === 'string') {
      try {
        const digest = toBulletinDigest(parseBulletinList(p.html))
        await saveBulletinDigest(digest)
        await saveBulletinRefreshedAt()
      } catch {
        // 保存失敗でも終了（次回再試行）
      }
      finish()
      return
    }
    // 未到達（掲示板メニュー未反映/ログイン途中）→ メニュー再発火＋収集。上限で諦める（保存はしない）。
    if (triesRef.current < MAX_TRIES) {
      triesRef.current += 1
      openThenCollect()
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
