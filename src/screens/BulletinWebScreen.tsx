import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { WebView, type WebViewInstance } from '../ui/GuardedWebView'
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native'
import { useClassView } from '../collect/classViewArbiter'
import {
  CLASS_TOP_URL,
  DESKTOP_UA,
  DETECT_PAGE_JS,
  ENTER_CLASS_PC_JS,
  OPEN_BULLETIN_JS,
  openBulletinDetailJs,
} from '../collect/injectedScripts'
import { nextBulletinWebStep, type BulletinWebSignal } from '../collect/bulletinWebFlow'
import { CLASS_DOWNLOAD_CAPTURE_JS, filenameFromContentDisposition } from '../collect/classDownload'
import { classifySharePayload, sanitizeDownloadFilename } from './pdfShare'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { loadBulletinDigest, updateBulletinItem } from '../storage/bulletinDigestStore'
import { COLORS, DARK, useThemeVariant } from '../theme'
import type { HomeStackParamList } from '../navigation/types'

// 一手を注入したあと、着地を見直すために現在ページを撃ち直す間隔（postback/AJAXの描画待ち）。
const REPROBE_MS = 1400

/**
 * 掲示を「アプリ内の可視WebView」でCLASS本物ページとして開く（方式B）。ヘッドレスの脆さを避け、
 * CLASSのJSを完全に走らせて確実に表示する。CLASSトップ→掲示板メニュー→対象掲示を自動で開く。
 *
 * 遷移は状態駆動（nextBulletinWebStep）。onLoadEnd 毎に無条件で ENTER/メニュー/掲示オープンの
 * タイマーを積むと、CLASSのSSO/postbackで多重 postback になり ViewState が競合して
 * 「別の画面で操作されました」を誘発する（実機バグの根本原因）。そこで各 onLoadEnd では現在ページを
 * 判定し、着地に応じた「次の一手」だけを冪等に一度注入する。
 *
 * 表示中は classViewArbiter でCLASS使用権を取り、出席の持続WebViewに譲らせる（単一セッション保護）。
 */
export default function BulletinWebScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'BulletinWeb'>>()
  const webviewRef = useRef<WebViewInstance>(null)
  const { setCollectActive } = useClassView()
  const [nonce, setNonce] = useState(0)
  const dark = useThemeVariant().variant === 'dark'
  const [target, setTarget] = useState<{ title: string; date: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // 対象掲示を開く操作（openDetail）を撃ったか。掲示ページに再着地しても二重に開かない（多重postback防止の要）。
  const detailFiredRef = useRef(false)
  const modalOpenRef = useRef(false)
  const reprobeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadBulletinDigest()
      .then((items) => {
        const it = items.find((i) => i.id === route.params.id)
        if (it) {
          setTarget({ title: it.title, date: it.date || it.id.split('::')[0] })
          // 可視ページで開けば CLASS 側で既読になる。ローカルも楽観的に既読へ。
          updateBulletinItem(it.id, (i) => ({ ...i, unread: false })).catch(() => undefined)
        }
      })
      .catch(() => undefined)
  }, [route.params.id])

  useFocusEffect(
    useCallback(() => {
      setCollectActive(true) // CLASS使用権を取り出席に譲らせる
      return () => {
        setCollectActive(false)
        if (reprobeTimer.current) clearTimeout(reprobeTimer.current)
      }
    }, [setCollectActive]),
  )

  function inject(js: string) {
    webviewRef.current?.injectJavaScript(js)
  }

  function scheduleReprobe() {
    if (reprobeTimer.current) clearTimeout(reprobeTimer.current)
    reprobeTimer.current = setTimeout(() => inject(DETECT_PAGE_JS), REPROBE_MS)
  }

  // ページ読込のたびに現在ページを判定する（無条件注入はしない）。判定結果は onMessage で受ける。
  function onLoadEnd() {
    // 添付DLの横取りフックを先に入れる（冪等）。CLASSの添付は ViewState 付きPOSTで流れるが、
    // RNW は URL だけを DownloadManager へ渡し、素のGETで取り直すためログインページが保存される。
    inject(CLASS_DOWNLOAD_CAPTURE_JS)
    inject(DETECT_PAGE_JS)
  }

  async function shareDownloaded(dataBase64: string, contentType: string | null, contentDisposition: string | null) {
    const kind = classifySharePayload({ dataBase64, contentType })
    if (kind !== 'ok') {
      setNotice(
        kind === 'login'
          ? 'ログインが切れているようです。「やり直す」を押してから、もう一度お試しください'
          : 'ファイルを取得できませんでした（受け取ったものがPDFではありません）',
      )
      return
    }
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setNotice('この端末では共有が利用できません')
        return
      }
      const name = sanitizeDownloadFilename(filenameFromContentDisposition(contentDisposition) ?? '', 'download.pdf')
      const uri = FileSystem.cacheDirectory + name
      await FileSystem.writeAsStringAsync(uri, dataBase64, { encoding: FileSystem.EncodingType.Base64 })
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })
      setNotice(null)
    } catch {
      setNotice('ファイルを開けませんでした')
    }
  }

  function onMessage(data: string) {
    let p: Record<string, unknown> | null = null
    try {
      p = JSON.parse(data)
    } catch {
      return
    }
    if (!p) return
    // 対象掲示のモーダルが開いた/既に開いていたら、以後は何も注入しない（ユーザーが読む）。
    if (p.type === 'classDownload') {
      if (p.stage === 'start') setNotice('ファイルを取得しています…')
      else if (p.stage === 'done' && typeof p.dataBase64 === 'string') {
        shareDownloaded(
          p.dataBase64,
          typeof p.contentType === 'string' ? p.contentType : null,
          typeof p.contentDisposition === 'string' ? p.contentDisposition : null,
        )
      } else if (p.stage === 'error') {
        setNotice(p.reason === 'size' ? 'ファイルが大きすぎます（25MB超）' : 'ファイルを取得できませんでした')
      }
      return
    }
    if (p.type === 'bulletindetail') {
      if (p.stage === 'opened' || p.stage === 'already-open') modalOpenRef.current = true
      return
    }
    if (p.type !== 'page') return
    const url = typeof p.url === 'string' ? p.url : ''
    const signal: BulletinWebSignal = {
      hasEnterSplash: !!p.hasEnterSplash,
      // frameset対応: 掲示は子フレーム内でトップURLはXut12401のまま→URLでなく dl.keiji の有無で着地判定。
      onBulletinPage: !!p.hasBulletinList || /bsd007/i.test(url),
      modalOpen: modalOpenRef.current,
      detailFired: detailFiredRef.current,
      hasPasswordInput: !!p.hasPasswordInput,
      hasMultiScreen: !!p.hasMultiScreen,
    }
    const step = nextBulletinWebStep(signal)
    if (step === 'enter') {
      inject(ENTER_CLASS_PC_JS)
      scheduleReprobe()
    } else if (step === 'openMenu') {
      inject(OPEN_BULLETIN_JS)
      scheduleReprobe()
    } else if (step === 'openDetail') {
      detailFiredRef.current = true // 先に立てて、再probeが来ても二重発火しない
      if (target) inject(openBulletinDetailJs(target.title, target.date))
      // openDetail は AJAX モーダルでページ遷移を伴わないため、結果は bulletindetail メッセージで受ける。
    }
    // 'idle' は何もしない（競合/ログイン/モーダル既開）。ユーザー操作での onLoadEnd 再来で再評価される。
  }

  function retry() {
    detailFiredRef.current = false
    modalOpenRef.current = false
    if (reprobeTimer.current) clearTimeout(reprobeTimer.current)
    setNonce((n) => n + 1)
  }

  return (
    <View style={[styles.root, dark && { backgroundColor: DARK.bg }]}>
      {target === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={dark ? COLORS.emeraldLight : COLORS.emerald} />
        </View>
      ) : null}
      <WebView
        key={nonce}
        ref={webviewRef}
        source={{ uri: CLASS_TOP_URL }}
        userAgent={DESKTOP_UA}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        cacheEnabled={false}
        onLoadEnd={onLoadEnd}
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        style={styles.web}
      />
      {notice ? (
        <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>
      ) : null}
      <Pressable style={styles.refresh} onPress={retry}>
        <Text style={styles.refreshText}>やり直す</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.white },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  web: { flex: 1 },
  refresh: {
    position: 'absolute',
    right: 14,
    bottom: 20,
    backgroundColor: COLORS.cta,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    elevation: 4,
  },
  refreshText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  notice: { position: 'absolute', left: 14, right: 100, bottom: 22, backgroundColor: COLORS.emeraldDark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  noticeText: { color: COLORS.white, fontSize: 12.5, fontWeight: '600' },
})
