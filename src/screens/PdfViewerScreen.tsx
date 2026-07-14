import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { WebView } from 'react-native-webview'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import { PDF_VIEWER_HTML } from './pdfViewerHtml'
import { buildSharePdfJs, sanitizePdfFilename } from './pdfShare'
import { COLORS } from '../theme'

type Params = { PdfViewer: { url: string; title?: string } }

// pdf.jsの読込〜描画がこの秒数を超えたら失敗扱い（無反応で固まらないように）。
const RENDER_TIMEOUT_MS = 20000
// 「端末アプリで開く」の取得がこの秒数を超えたら失敗扱いにして共有中フラグを解除（ボタンが固まらないように）。
const SHARE_TIMEOUT_MS = 20000

/**
 * LETUSファイル(PDF)のアプリ内ビューア。主経路はpdf.jsでのcanvas描画。
 * 加えて「端末のアプリで開く」を常設し、同一オリジンでBlob取得→base64→FileSystem→Sharingで
 * 端末のPDFアプリに渡す確実な代替経路を提供する（実機でpdf.js描画が不調でも開ける保険）。
 */
export default function PdfViewerScreen() {
  const route = useRoute<RouteProp<Params, 'PdfViewer'>>()
  const navigation = useNavigation()
  const { url } = route.params
  const webviewRef = useRef<WebView>(null)
  const [phase, setPhase] = useState<'loading' | 'rendering' | 'done' | 'error'>('loading')
  const [pages, setPages] = useState(0)
  const [nonce, setNonce] = useState(0)
  const [sharing, setSharing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const origin = useMemo(() => {
    try {
      return new URL(url).origin
    } catch {
      return 'https://letus.ed.tus.ac.jp'
    }
  }, [url])

  function armTimeout() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setPhase((p) => (p === 'done' ? p : 'error')), RENDER_TIMEOUT_MS)
  }

  function clearShareTimer() {
    if (shareTimerRef.current) {
      clearTimeout(shareTimerRef.current)
      shareTimerRef.current = null
    }
  }

  // アンマウント時に保留中のタイマーを片付ける。
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (shareTimerRef.current) clearTimeout(shareTimerRef.current)
  }, [])

  function retry() {
    // WebView作り直しで進行中の共有取得は失われるため、共有フラグとタイマーも必ずリセットする。
    clearShareTimer()
    setSharing(false)
    setPhase('loading')
    setPages(0)
    setNonce((n) => n + 1)
  }

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(null), 3000)
  }

  function openExternally() {
    if (sharing) return
    setSharing(true)
    flash('ファイルを取得しています…')
    clearShareTimer()
    shareTimerRef.current = setTimeout(() => {
      shareTimerRef.current = null
      setSharing(false)
      flash('ファイルを取得できませんでした')
    }, SHARE_TIMEOUT_MS)
    webviewRef.current?.injectJavaScript(buildSharePdfJs())
  }

  async function shareBase64(dataBase64: string) {
    try {
      const available = await Sharing.isAvailableAsync()
      if (!available) {
        flash('この端末では共有が利用できません')
        return
      }
      const fileUri = FileSystem.cacheDirectory + sanitizePdfFilename(url)
      await FileSystem.writeAsStringAsync(fileUri, dataBase64, { encoding: FileSystem.EncodingType.Base64 })
      await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })
    } catch {
      flash('端末アプリで開けませんでした')
    } finally {
      setSharing(false)
    }
  }

  function onMessage(data: string) {
    let p: { type?: string; stage?: string; pages?: number; dataBase64?: string; reason?: string }
    try {
      p = JSON.parse(data)
    } catch {
      return
    }
    if (p.type !== 'pdf') return
    if (p.stage === 'loading') {
      setPhase('loading')
      armTimeout()
    } else if (p.stage === 'rendering') {
      setPhase('rendering')
      setPages(typeof p.pages === 'number' ? p.pages : 0)
      armTimeout()
    } else if (p.stage === 'done') {
      if (timerRef.current) clearTimeout(timerRef.current)
      setPhase('done')
    } else if (p.stage === 'error') {
      if (timerRef.current) clearTimeout(timerRef.current)
      setPhase('error')
    } else if (p.stage === 'share' && typeof p.dataBase64 === 'string') {
      clearShareTimer()
      shareBase64(p.dataBase64)
    } else if (p.stage === 'shareError') {
      clearShareTimer()
      setSharing(false)
      flash(p.reason === 'size' ? 'ファイルが大きすぎて共有できません（25MB超）' : 'ファイルを取得できませんでした')
    }
  }

  return (
    <View style={styles.root}>
      <WebView
        key={nonce}
        ref={webviewRef}
        source={{ html: PDF_VIEWER_HTML, baseUrl: `${origin}/` }}
        injectedJavaScriptBeforeContentLoaded={`window.__PDF_URL=${JSON.stringify(url)};true;`}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={armTimeout}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={styles.web}
      />

      {/* 常設の「端末のアプリで開く」 */}
      <Pressable style={styles.openBtn} onPress={openExternally} disabled={sharing}>
        <Text style={styles.openBtnText}>{sharing ? '取得中…' : '端末のアプリで開く'}</Text>
      </Pressable>

      {notice ? (
        <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>
      ) : null}

      {phase !== 'done' ? (
        <View style={styles.overlay} pointerEvents={phase === 'error' ? 'auto' : 'none'}>
          {phase === 'error' ? (
            <View style={styles.errorBox} pointerEvents="auto">
              <Text style={styles.errorText}>アプリ内で表示できませんでした。</Text>
              <View style={styles.btnRow}>
                <Pressable style={[styles.btn, { backgroundColor: COLORS.cta }]} onPress={openExternally} disabled={sharing}>
                  <Text style={styles.btnText}>{sharing ? '取得中…' : '端末のアプリで開く'}</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={retry}>
                  <Text style={[styles.btnText, { color: COLORS.emeraldDark }]}>再試行</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => navigation.goBack()}>
                  <Text style={[styles.btnText, { color: COLORS.emeraldDark }]}>閉じる</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={COLORS.white} />
              <Text style={styles.loadingText}>
                {phase === 'rendering' ? `表示しています…（${pages}ページ）` : '読み込んでいます…'}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  )
}

// PDFビューアは慣習的にテーマ非追従の暗灰クローム（アプリ配色トークンではないビューア固有の装飾値）。
const PDF = { chrome: '#525659', noticeBg: '#04322a', scrim: 'rgba(0,0,0,0.35)', ghostBorder: '#b9ddcd' } // design-allow

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PDF.chrome },
  web: { flex: 1, backgroundColor: PDF.chrome },
  openBtn: {
    position: 'absolute', right: 14, bottom: 20, backgroundColor: COLORS.cta,
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, elevation: 4,
  },
  openBtnText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  notice: {
    position: 'absolute', left: 16, right: 16, bottom: 74, backgroundColor: PDF.noticeBg,
    borderRadius: 12, padding: 12, alignItems: 'center',
  },
  noticeText: { color: COLORS.white, fontSize: 13 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  loadingBox: { alignItems: 'center', gap: 12, backgroundColor: PDF.scrim, padding: 20, borderRadius: 14 },
  loadingText: { color: COLORS.white, fontSize: 13 },
  errorBox: { backgroundColor: COLORS.white, padding: 20, borderRadius: 16, marginHorizontal: 24, alignItems: 'center', gap: 14 },
  errorText: { color: COLORS.ink, fontSize: 15, fontWeight: '500' },
  btnRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  btn: { minWidth: 96, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnGhost: { backgroundColor: COLORS.tint, borderWidth: 1, borderColor: PDF.ghostBorder },
  btnText: { color: COLORS.white, fontSize: 14, fontWeight: '600' },
})
