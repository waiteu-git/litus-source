import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { DESKTOP_UA, DETECT_PAGE_JS, ENTER_CLASS_PC_JS } from './injectedScripts'
import { collectEarlyAction, type CollectSignal } from './collectFlow'
import { useClassView } from './classViewArbiter'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
const CLASS_ON_LOAD_JS = `${ENTER_CLASS_PC_JS}\n${DETECT_PAGE_JS}`
// 非表示WebViewでの収集全体のハング保険。
const OVERALL_TIMEOUT_MS = 25000
// ページ読込後にメニュー発火→抽出を試みるまでの待ち。
const OPEN_DELAY_MS = 1200
const COLLECT_DELAY_MS = 2600
// 0件時に「再ナビせず」もう一度抽出するまでの待ち（描画待ち）。
const COLLECT_RETRY_MS = 1600
// 目的ページ未到達（0件）時の再試行上限。
const MAX_TRIES = 3
// エラー/失効での作り直し上限（無限リロード防止）。
const MAX_REBOOTS = 2

/**
 * CLASS(JSF)の headless 収集の共有骨格。非表示WebViewで CLASS を開き、PC自動入場→メニュー発火→
 * DOM抽出を自動実行する。時間割/掲示は openJs・collectJs・resultType・onData だけが違うので、
 * 遷移・調停・リトライの共通部分をここに集約する（TimetableSyncEngine / BulletinSyncEngine の実体）。
 *
 * 出席の絶対優先（classViewArbiter）:
 * - 実行中は使用権(collectActive)を取り、出席の持続WebViewに譲らせる（CLASS単一セッション保護）。
 * - 出席が前面になったら即中断してCLASSを明け渡す。
 * - さらに DETECT_PAGE_JS の着地判定で PC競合/メンテ中は即座に離脱してロックを解放する（出席の自動
 *   検出を無駄に止めない。出席安定化と同じ「実DOMマーカーで着地を判定」する方式を収集にも適用）。
 *
 * onData は目的データpayload(raw)を受け取り、保存できたら true（=収集完了）を返す。0件等で未到達なら
 * false（=再試行）。成否に関わらず onFinished は1回だけ。
 */
export default function ClassHeadlessCollector({
  openJs,
  collectJs,
  resultType,
  onData,
  onFinished,
  fallbackJs,
}: {
  openJs: string
  collectJs: string
  resultType: string
  onData: (raw: string) => Promise<boolean> | boolean
  onFinished: () => void
  /** メニュー発火で目的ページに到達できない時の最終手段（直リンク遷移JS等）。省略可。 */
  fallbackJs?: string
}) {
  const webviewRef = useRef<WebView>(null)
  const { setCollectActive, attendanceFocused } = useClassView()
  const triesRef = useRef(0)
  const rebootsRef = useRef(0)
  const fallbackUsedRef = useRef(false)
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

  function reboot() {
    if (rebootsRef.current >= MAX_REBOOTS) {
      finish()
      return
    }
    rebootsRef.current += 1
    triesRef.current = 0
    setNonce((n) => n + 1)
  }

  function onLoadEnd() {
    // 入口スプラッシュならPC ENTERで先へ＋着地判定。ログイン後はメニューを叩いて目的一覧へ。
    webviewRef.current?.injectJavaScript(CLASS_ON_LOAD_JS)
    setTimeout(() => webviewRef.current?.injectJavaScript(openJs), OPEN_DELAY_MS)
    setTimeout(() => webviewRef.current?.injectJavaScript(collectJs), COLLECT_DELAY_MS)
  }

  async function onMessage(data: string) {
    let p: { type?: string } | null = null
    try {
      p = JSON.parse(data)
    } catch {
      return
    }
    if (!p || p.type === 'nav' || p.type === 'auth') return
    // 着地判定: PC競合/メンテ中は即離脱してロック解放、エラー/失効は作り直し。それ以外は続行。
    if (p.type === 'page') {
      const act = collectEarlyAction(p as CollectSignal)
      if (act === 'abort') finish()
      else if (act === 'reboot') reboot()
      return
    }
    if (p.type === 'error') {
      reboot()
      return
    }
    if (p.type !== resultType) return
    // 目的データ到達 → 保存できたら完了。
    if (await onData(data)) {
      finish()
      return
    }
    // 未到達/未描画 → 再ナビ（メニュー再クリック）はせず**再抽出のみ**（二重POSTでViewStateを壊さない。
    // ページ遷移は各読込の onLoadEnd 側 OPEN が担う）。既定回数を尽くしたら直リンクへ最終フォールバック。
    if (triesRef.current < MAX_TRIES) {
      triesRef.current += 1
      setTimeout(() => webviewRef.current?.injectJavaScript(collectJs), COLLECT_RETRY_MS)
    } else if (fallbackJs && !fallbackUsedRef.current) {
      fallbackUsedRef.current = true
      triesRef.current = 0
      webviewRef.current?.injectJavaScript(fallbackJs)
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
        onError={() => reboot()}
        style={styles.web}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
  web: { width: 1, height: 1 },
})
