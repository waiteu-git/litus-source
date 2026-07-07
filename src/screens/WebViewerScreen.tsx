import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useRoute, type RouteProp } from '@react-navigation/native'

type Params = { Web: { url: string; title?: string } }

/**
 * アプリ内WebViewビューア。シラバス・LETUSコース・課題ページなどを外部ブラウザに出さず
 * アプリ内で表示する（Cookie共有なのでSSOログイン済みのまま開ける）。
 * CLASSのJSF業務画面（uprx配下）はここでは開かない前提（出席タブと競合するため。
 * シラバスは静的HTML直リンクなので安全）。
 */
export default function WebViewerScreen() {
  const route = useRoute<RouteProp<Params, 'Web'>>()
  const { url } = route.params
  return (
    <View style={styles.root}>
      <WebView
        source={{ uri: url }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        style={styles.web}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1 },
})
