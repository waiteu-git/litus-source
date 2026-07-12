import { useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { COLLECT_ASSIGNMENT_PAGE_JS, DESKTOP_UA } from './injectedScripts'
import { decideLetusFetch } from './letusFetchDecision'
import { parseAssignBody } from '../parsers/letusBody'
import { setLetusBody } from '../storage/letusBodyStore'

// 読込ハングの保険。超えたら失敗として返し、無限スピナーを避ける。
const FETCH_TIMEOUT_MS = 15000

/**
 * 単一のLETUS課題ページを非表示WebViewで開き、本文＋添付を letusBodyStore に保存する単発フェッチャ。
 * AssignmentCollector と同型（DESKTOP_UA固定・onLoadEnd で COLLECT_ASSIGNMENT_PAGE_JS 注入）。
 * onLoadEnd 毎にHTMLが来るため decideLetusFetch で判定し、body に着地したときだけ抽出・保存する。
 * needsLogin/タイムアウト/空本文/パース例外は ok:false を返し、画面側で「LETUSで開く」フォールバックに落とす。
 */
export default function LetusPageFetcher({
  url,
  onFinished,
}: {
  url: string
  onFinished: (r: { ok: boolean }) => void
}) {
  const webviewRef = useRef<WebView>(null)
  const doneRef = useRef(false)

  function finish(ok: boolean) {
    if (doneRef.current) return
    doneRef.current = true
    onFinished({ ok })
  }

  useEffect(() => {
    const t = setTimeout(() => finish(false), FETCH_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onMessage(data: string) {
    if (doneRef.current) return
    let payload: { type?: string; html?: string; url?: string }
    try {
      payload = JSON.parse(data)
    } catch {
      return
    }
    if (payload.type !== 'assignmentpage' || typeof payload.html !== 'string') return
    const step = decideLetusFetch(payload.html, payload.url ?? url)
    if (step === 'wait') return
    if (step === 'needsLogin') {
      finish(false)
      return
    }
    // step === 'body': 抽出・保存。パース/保存いずれの例外もフォールバックに落とす
    // （parseAssignBody は不正な pluginfile URL で decodeURIComponent が throw し得るため try 内に含める）。
    try {
      const body = parseAssignBody(payload.html)
      if (!body.description && body.attachments.length === 0) {
        finish(false)
        return
      }
      await setLetusBody(url, body, new Date().toISOString())
      finish(true)
    } catch {
      finish(false)
    }
  }

  const webview = useMemo(
    () => (
      <WebView
        ref={webviewRef}
        source={{ uri: url }}
        userAgent={DESKTOP_UA}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onLoadEnd={() => webviewRef.current?.injectJavaScript(COLLECT_ASSIGNMENT_PAGE_JS)}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={styles.webview}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url],
  )

  return <View style={styles.box}>{webview}</View>
}

const styles = StyleSheet.create({
  box: { height: 1, opacity: 0 },
  webview: { height: 1, opacity: 0 },
})
