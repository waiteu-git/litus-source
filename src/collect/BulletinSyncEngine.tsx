import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { DESKTOP_UA, COLLECT_BULLETIN_JS, DETECT_AUTH_JS, ENTER_CLASS_PC_JS, GO_BULLETIN_JS } from './injectedScripts'
import { parseBulletinList, toBulletinDigest } from '../parsers/bulletin'
import { saveBulletinDigest } from '../storage/bulletinDigestStore'
import { saveBulletinRefreshedAt } from '../storage/refreshMetaStore'
import { useClassView } from './classViewArbiter'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
const CLASS_ON_LOAD_JS = `${ENTER_CLASS_PC_JS}\n${DETECT_AUTH_JS}`
// 非表示WebViewでの収集全体のハング保険。
const OVERALL_TIMEOUT_MS = 25000
// ページ読込後に掲示抽出を試みるまでの待ち。
const COLLECT_DELAY_MS = 1600
// 掲示ページに未到達だったときの再試行上限。
const MAX_TRIES = 4

/**
 * CLASS掲示一覧の headless 収集エンジン。非表示WebViewで CLASS を開き、PC自動入場後にポータル
 * (Xut12401＝掲示一覧がメニューと同居)へ着地したら dl.keiji を抽出→未読ダイジェストとして保存する。
 * 実行中は classViewArbiter の使用権を取り、出席の持続WebViewに譲らせる（CLASS単一セッション保護）。
 * 掲示ページ(onKeijiPage)を確認できたときだけ保存し、ログイン途中等では上書きしない。成否に関わらず
 * onFinished を1回だけ呼ぶ。
 */
export default function BulletinSyncEngine({ onFinished }: { onFinished: () => void }) {
  const webviewRef = useRef<WebView>(null)
  const { setCollectActive, attendanceFocused } = useClassView()
  const triesRef = useRef(0)
  const doneRef = useRef(false)
  // 掲示ページ以外（CLASSメニュー/出席等）に着地したとき、掲示URLへ明示遷移するのは1回だけ。
  const navigatedRef = useRef(false)
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

  function collectSoon() {
    setTimeout(() => webviewRef.current?.injectJavaScript(COLLECT_BULLETIN_JS), COLLECT_DELAY_MS)
  }

  function onLoadEnd() {
    // 入口スプラッシュならPC ENTERで先へ。ポータルなら掲示がその場にある。
    webviewRef.current?.injectJavaScript(CLASS_ON_LOAD_JS)
    collectSoon()
  }

  async function onMessage(data: string) {
    let p: { type?: string; html?: string; onKeijiPage?: boolean } | null = null
    try {
      p = JSON.parse(data)
    } catch {
      return
    }
    if (!p || p.type !== 'bulletin') return
    if (p.onKeijiPage && typeof p.html === 'string') {
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
    // 掲示ページに着地していない（CLASSメニュー/出席画面/ログイン途中/スプラッシュ等）。
    // まだ掲示URLへ遷移していなければ、明示的に掲示一覧へ移動してから収集し直す。
    if (!navigatedRef.current) {
      navigatedRef.current = true
      webviewRef.current?.injectJavaScript(GO_BULLETIN_JS) // → 新規ロード→onLoadEndで再収集
      return
    }
    // 遷移後も掲示が取れないときだけ、少し待って再収集。上限で諦める。
    if (triesRef.current < MAX_TRIES) {
      triesRef.current += 1
      collectSoon()
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
