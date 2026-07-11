import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native'
import { useClassView } from '../collect/classViewArbiter'
import {
  CLASS_TOP_URL,
  DESKTOP_UA,
  ENTER_CLASS_PC_JS,
  OPEN_BULLETIN_JS,
  openBulletinDetailJs,
} from '../collect/injectedScripts'
import { loadBulletinDigest, updateBulletinItem } from '../storage/bulletinDigestStore'
import { COLORS } from '../theme'
import type { HomeStackParamList } from '../navigation/types'

/**
 * 掲示を「アプリ内の可視WebView」でCLASS本物ページとして開く（方式B）。ヘッドレスの脆さを避け、
 * CLASSのJSを完全に走らせて確実に表示する。CLASSトップ→掲示板メニュー→対象掲示を自動で開く。
 * 自動で開かなくても掲示板が見えているのでユーザーが自分でタップできる。読む＝CLASS側で既読化。
 * 表示中は classViewArbiter でCLASS使用権を取り、出席の持続WebViewに譲らせる（単一セッション保護）。
 */
export default function BulletinWebScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'BulletinWeb'>>()
  const webviewRef = useRef<WebView>(null)
  const { setCollectActive } = useClassView()
  const [nonce, setNonce] = useState(0)
  const [target, setTarget] = useState<{ title: string; date: string } | null>(null)

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
      return () => setCollectActive(false)
    }, [setCollectActive]),
  )

  function onLoadEnd() {
    // 入口スプラッシュならPC ENTER。ログイン後は掲示板メニューへ、掲示板に着いたら対象掲示を開く。
    webviewRef.current?.injectJavaScript(ENTER_CLASS_PC_JS)
    setTimeout(() => webviewRef.current?.injectJavaScript(OPEN_BULLETIN_JS), 1200)
    if (target) {
      setTimeout(() => webviewRef.current?.injectJavaScript(openBulletinDetailJs(target.title, target.date)), 2800)
    }
  }

  return (
    <View style={styles.root}>
      {target === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.emerald} />
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
        style={styles.web}
      />
      <Pressable style={styles.refresh} onPress={() => setNonce((n) => n + 1)}>
        <Text style={styles.refreshText}>やり直す</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
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
  refreshText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
})
