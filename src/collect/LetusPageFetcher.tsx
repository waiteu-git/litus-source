import { useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView, type WebViewInstance } from '../ui/GuardedWebView'
import { COLLECT_ASSIGNMENT_PAGE_JS, DESKTOP_UA } from './injectedScripts'
import { hasLetusLoginMarker } from '../health/collectionSignals'
import { parseAssignBody } from '../parsers/letusBody'
import { isAssignPageLanded } from '../parsers/letus'
import { setLetusBody } from '../storage/letusBodyStore'
import { isLetusContentUrl } from '../links/letusContentHost'
import { classifyLinkTarget } from '../links/externalLink'

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
  const webviewRef = useRef<WebViewInstance>(null)
  const doneRef = useRef(false)

  // 🔴 保存済みデータに悪性URLが既に入っている端末への防御（2026-08-28 監査 CONFIRMED）。
  // 入口の検証（WebViewerScreen）は**これから**の保存しか止められない。この WebView は
  // sharedCookiesEnabled + thirdPartyCookiesEnabled の非表示1×1なので、ここを素通りさせると
  // 攻撃者ホストが黙って読み込まれ続ける。**一括削除ではなく無害化で受ける**
  // （削除は不可逆で、誤検知時にユーザーが手で追加した正規の課題を消す）。
  const allowed = isLetusContentUrl(url)

  function finish(ok: boolean) {
    if (doneRef.current) return
    doneRef.current = true
    onFinished({ ok })
  }

  useEffect(() => {
    // 許可外は WebView を一切マウントせず、即フォールバック（画面は「LETUSで開く」を出す）。
    if (!allowed) {
      finish(false)
      return
    }
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
    // SSOセッション切れ（ログインページ着地）はフォールバックへ。
    if (hasLetusLoginMarker(payload.html)) {
      finish(false)
      return
    }
    // 動く実装（AssignmentCollector）に合わせ、URLゲートに頼らず本文が取れたら成功とする。
    // location.href は SSO リダイレクトや末尾パラメータで課題URL形に着地しないことがあり、
    // URLゲート方式では永久 wait→タイムアウトになるため（実測: 一覧収集は成功するが本文取得だけ失敗）。
    // パース/保存の例外はフォールバックへ（parseAssignBody は不正な pluginfile URL で
    // decodeURIComponent が throw し得るため try 内に含める）。
    let body
    try {
      // baseUrl は実際に着地したページのURL（無ければ要求URL）。添付の same-host 検証の基準になる。
      body = parseAssignBody(payload.html, payload.url ?? url)
    } catch {
      finish(false)
      return
    }
    // 本文も添付も無い場合、締切/提出状況が読めれば課題ページには着地済み（本文パーサが実DOMの
    // コンテナに一致せず空を返したケース）。この場合は空本文として確定し「本文なし」を表示する
    // ＝無限待ち→タイムアウト失敗を断つ。どちらも読めなければSSO中間ページ等なので次を待つ。
    if (!body.description && body.attachments.length === 0 && !isAssignPageLanded(payload.html, payload.url ?? url)) return
    try {
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
        onShouldStartLoadWithRequest={(req) => {
          // ⚠ この取得は**SSOリダイレクトを経由する**（上のコメント参照）。ホスト完全一致で
          // 塞ぐとログイン連鎖が切れて本文が永久に取れない。⇒ 遷移の可否は
          // classifyLinkTarget（学内 + Microsoft のログイン基盤 + SSOマーカー）に委ね、
          // **それでも外部と判定されるものだけ**を落とす。入口(url)は既に厳格に検証済みなので、
          // ここまで来る外部遷移は LETUS 自身がそこへ飛ばした場合に限られる。
          // 🔴 openExternally は呼ばない＝**裏で走る取得がOSのブラウザを勝手に開かない**。
          return classifyLinkTarget({ url: req.url, isTopFrame: req.isTopFrame }) !== 'external'
        }}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={styles.webview}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url],
  )

  return <View style={styles.box}>{allowed ? webview : null}</View>
}

const styles = StyleSheet.create({
  box: { height: 1, opacity: 0 },
  webview: { height: 1, opacity: 0 },
})
