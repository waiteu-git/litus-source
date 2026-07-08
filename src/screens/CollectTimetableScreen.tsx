import { useEffect, useRef, useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ActionButton, StepList, useUi, type Step } from '../ui/screen'
import { COLORS, useThemeVariant } from '../theme'
import { parseCollectionMessage } from '../collect/timetableMessage'
import {
  DESKTOP_UA,
  COLLECT_TIMETABLE_JS,
  DETECT_AUTH_JS,
  ENTER_CLASS_PC_JS,
  OPEN_TIMETABLE_JS,
} from '../collect/injectedScripts'
import { saveTimetable } from '../storage/timetableStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { useAuth } from '../auth/AuthProvider'
import { classifyAuthState } from '../auth/classifyAuthState'
import { useClassView } from '../collect/classViewArbiter'
import type { TimetableStackParamList } from '../navigation/types'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
// 読込ごとに PC ENTER自動入場 + ログイン状態判定 を注入。
const CLASS_ON_LOAD_JS = `${ENTER_CLASS_PC_JS}\n${DETECT_AUTH_JS}`

/**
 * 時間割の手動収集画面。「時間割は一瞬で終わる」ため案3b（ステップ・タイムライン）で
 * 接続→ページを開く→抽出・保存の3段を可視化する。WebView駆動のロジックは元実装のまま。
 */
export default function CollectTimetableScreen() {
  const webviewRef = useRef<WebView>(null)
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const auth = useAuth()
  const { variant } = useThemeVariant()
  const ui = useUi()
  // CLASSは複数画面同時操作を禁止。この画面がフォーカス中は調停（classViewArbiter）で
  // CLASSの使用権を取り、出席タブの持続WebViewに譲ってもらう。離れたら返す。
  const isFocused = useIsFocused()
  const { setCollectActive } = useClassView()
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [opened, setOpened] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [webviewKey, setWebviewKey] = useState(0)

  useEffect(() => {
    setCollectActive(isFocused)
    return () => setCollectActive(false)
  }, [isFocused, setCollectActive])

  function collect() {
    setCollecting(true)
    setError(null)
    webviewRef.current?.injectJavaScript(COLLECT_TIMETABLE_JS)
  }

  function openTimetable() {
    setOpened(true)
    webviewRef.current?.injectJavaScript(OPEN_TIMETABLE_JS)
  }

  function retry() {
    setError(null)
    setLoaded(false)
    setOpened(false)
    setCollecting(false)
    setWebviewKey((k) => k + 1)
  }

  async function onMessage(data: string) {
    try {
      const parsed = JSON.parse(data)
      if (parsed && parsed.type === 'nav') return
      if (parsed && parsed.type === 'auth') {
        auth.setClass(
          classifyAuthState({
            hasPasswordInput: !!parsed.hasPasswordInput,
            hasLogoutLink: !!parsed.hasLogoutLink,
          }),
        )
        return
      }
    } catch {
      // 後段の parseCollectionMessage がエラーを表現する
    }
    const result = parseCollectionMessage(data)
    if (!result.error && result.collections.length > 0) {
      try {
        await saveTimetable(result.collections)
        await refreshAllNotifications()
      } catch {
        setCollecting(false)
        setError('保存に失敗しました')
        return
      }
      setError(null)
      navigation.goBack()
      return
    }
    setCollecting(false)
    setError(result.error ?? '収集できませんでした')
  }

  const steps: Step[] = [
    { label: 'CLASSに接続', state: loaded ? 'done' : 'active' },
    {
      label: '時間割ページを開く',
      state: error && !opened ? 'error' : opened ? 'done' : loaded ? 'active' : 'pending',
    },
    {
      label: 'データを抽出・保存',
      sub: error ?? undefined,
      state: error ? 'error' : collecting ? 'active' : 'pending',
    },
  ]

  return (
    <View style={styles.root}>
      {variant === 'green' ? (
        <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.webviewBox}>
        {isFocused ? (
          <WebView
            key={webviewKey}
            ref={webviewRef}
            source={{ uri: CLASS_URL }}
            cacheEnabled={false}
            userAgent={DESKTOP_UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onLoadEnd={() => {
              setLoaded(true)
              webviewRef.current?.injectJavaScript(CLASS_ON_LOAD_JS)
            }}
            onMessage={(e) => onMessage(e.nativeEvent.data)}
          />
        ) : null}
      </View>
      <View style={styles.panel}>
        <View style={[ui.card, styles.card]}>
          <StepList steps={steps} />
        </View>
        {error ? (
          <View style={styles.controls}>
            <View style={{ flex: 1 }}>
              <ActionButton label="再試行" onPress={retry} />
            </View>
            <View style={{ flex: 1 }}>
              <ActionButton label="時間割を開く" ghost onPress={openTimetable} />
            </View>
          </View>
        ) : (
          <View style={styles.controls}>
            <View style={{ flex: 1 }}>
              <ActionButton label="時間割を開く" ghost onPress={openTimetable} />
            </View>
            <View style={{ flex: 1 }}>
              <ActionButton label="収集" onPress={collect} />
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webviewBox: { flex: 1 },
  panel: { padding: 12, gap: 10 },
  card: { paddingVertical: 16 },
  controls: { flexDirection: 'row', gap: 8 },
})
