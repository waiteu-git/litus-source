import { useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import { PDF_VIEWER_HTML } from './pdfViewerHtml'
import { COLORS } from '../theme'

type Params = { PdfViewer: { url: string; title?: string } }

// pdf.jsの読込〜描画がこの秒数を超えたら失敗扱い（無反応で固まらないように）。
const RENDER_TIMEOUT_MS = 20000

/**
 * LETUSファイル(PDF)のアプリ内ビューア。WebViewを **PDFと同一オリジン(baseUrl)** で開くことで、
 * Cookie付きの同一オリジン fetch を可能にし（CORS回避・ログイン維持）、pdf.jsでcanvas描画する。
 * 実機の可視WebViewで描画する前提。失敗/タイムアウト時は再試行・閉じるを出す（固まらせない）。
 */
export default function PdfViewerScreen() {
  const route = useRoute<RouteProp<Params, 'PdfViewer'>>()
  const navigation = useNavigation()
  const { url } = route.params
  const [phase, setPhase] = useState<'loading' | 'rendering' | 'done' | 'error'>('loading')
  const [pages, setPages] = useState(0)
  const [nonce, setNonce] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function retry() {
    setPhase('loading')
    setPages(0)
    setNonce((n) => n + 1)
  }

  function onMessage(data: string) {
    let p: { type?: string; stage?: string; pages?: number }
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
    }
  }

  return (
    <View style={styles.root}>
      <WebView
        key={nonce}
        source={{ html: PDF_VIEWER_HTML, baseUrl: `${origin}/` }}
        // ページ本文スクリプトより先に対象URLを渡す。
        injectedJavaScriptBeforeContentLoaded={`window.__PDF_URL=${JSON.stringify(url)};true;`}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={armTimeout}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={styles.web}
      />
      {phase !== 'done' ? (
        <View style={styles.overlay} pointerEvents={phase === 'error' ? 'auto' : 'none'}>
          {phase === 'error' ? (
            <View style={styles.errorBox} pointerEvents="auto">
              <Text style={styles.errorText}>ファイルを表示できませんでした。</Text>
              <View style={styles.btnRow}>
                <Pressable style={[styles.btn, { backgroundColor: COLORS.cta }]} onPress={retry}>
                  <Text style={styles.btnText}>再試行</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => navigation.goBack()}>
                  <Text style={[styles.btnText, { color: COLORS.emeraldDark }]}>閉じる</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#ffffff" />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#525659' },
  web: { flex: 1, backgroundColor: '#525659' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: { alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.35)', padding: 20, borderRadius: 14 },
  loadingText: { color: '#ffffff', fontSize: 13 },
  errorBox: { backgroundColor: '#ffffff', padding: 20, borderRadius: 16, marginHorizontal: 24, alignItems: 'center', gap: 14 },
  errorText: { color: '#12332a', fontSize: 15, fontWeight: '500' },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { minWidth: 96, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#eef5f2', borderWidth: 1, borderColor: '#b9ddcd' },
  btnText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
})
