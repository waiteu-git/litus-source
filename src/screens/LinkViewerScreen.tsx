import { useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import { useClassView } from '../collect/classViewArbiter'
import { isPdfLikeUrl } from '../collect/injectedScripts'
import { COLORS } from '../theme'

type Params = { Link: { url: string; title?: string; isClass?: boolean } }

/**
 * 学食(外部)・CLASS掲示のアプリ内表示ビューア。LETUS課題追加のような注入はしない軽量版。
 * isClass=true（掲示）のときは classViewArbiter でCLASS使用権を取り、出席の持続WebViewに譲らせる
 * （CLASSは同一セッション複数画面禁止）。フォーカスの度に最新表示するためreloadし、手動更新も可能。
 * PDFリンクは PdfViewer に委譲する。
 */
export default function LinkViewerScreen() {
  const route = useRoute<RouteProp<Params, 'Link'>>()
  const navigation = useNavigation<any>()
  const { url, isClass } = route.params
  const webviewRef = useRef<WebView>(null)
  const { setCollectActive } = useClassView()
  const [nonce, setNonce] = useState(0)

  // 掲示表示中はCLASS使用権を取り、離れたら返す。フォーカスの度にリロードして最新化。
  useFocusEffect(
    useCallback(() => {
      if (isClass) setCollectActive(true)
      setNonce((n) => n + 1) // 再フォーカスで作り直し＝最新表示
      return () => {
        if (isClass) setCollectActive(false)
      }
    }, [isClass, setCollectActive]),
  )

  return (
    <View style={styles.root}>
      <WebView
        key={nonce}
        ref={webviewRef}
        source={{ uri: url }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(req) => {
          if (isPdfLikeUrl(req.url)) {
            navigation.navigate('PdfViewer', { url: req.url })
            return false
          }
          return true
        }}
        style={styles.web}
      />
      <Pressable style={styles.refresh} onPress={() => setNonce((n) => n + 1)}>
        <Text style={styles.refreshText}>更新</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1 },
  refresh: {
    position: 'absolute', right: 14, bottom: 20, backgroundColor: COLORS.cta,
    borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11, elevation: 4,
  },
  refreshText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
})
