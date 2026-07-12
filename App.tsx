import { useEffect, type ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
// ルート(index.js)からの import は全7ウェイトのTTFがバンドルされるため、サブパスから3つだけ読む（APKサイズ抑制）。
import { IBMPlexSansJP_400Regular } from '@expo-google-fonts/ibm-plex-sans-jp/400Regular'
import { IBMPlexSansJP_500Medium } from '@expo-google-fonts/ibm-plex-sans-jp/500Medium'
import { IBMPlexSansJP_700Bold } from '@expo-google-fonts/ibm-plex-sans-jp/700Bold'
import RootTabs from './src/navigation/RootTabs'
import BackgroundLetusSync from './src/collect/BackgroundLetusSync'
import BackgroundBulletinSync from './src/collect/BackgroundBulletinSync'
import { ClassViewProvider } from './src/collect/classViewArbiter'
import { AttendanceEngineProvider } from './src/attendance/AttendanceEngineProvider'
import { AuthProvider } from './src/auth/AuthProvider'
import { AssignmentsVersionProvider } from './src/assignments/assignmentsVersion'
import { ClassEventsVersionProvider } from './src/timetableEvents/classEventsVersion'
import { LoginGate } from './src/auth/LoginGate'
import { KillSwitchGate, KillSwitchProvider } from './src/health/KillSwitchProvider'
import { ThemeProvider, useThemeVariant, COLORS, DARK } from './src/theme'
import { DisplaySettingsProvider } from './src/displaySettings'
import {
  addNotificationResponseListener,
  ATTENDANCE_OPEN_TAG,
  BULLETIN_TAG,
  clearDeliveredBulletinNotifications,
  configureNotifications,
  getInitialNotificationTag,
  requestNotificationPermission,
} from './src/notifications/notifier'
import { refreshAllNotifications } from './src/notifications/notificationRefresh'
import { subscribeForeground } from './src/app/foregroundOrchestrator'
import { navigationRef, flushPendingNavigation, requestOpenAttendance, requestOpenBulletins } from './src/navigation/navigationRef'
import { subscribeWidgetLinks } from './src/widget/widgetLinking'

// 出席アラーム通知の data.tag（notifier.ts の予約と一致させる）。
const ATTENDANCE_TAG = 'attendance-alarm'

// フォントロード完了までネイティブスプラッシュを保持する（白画面やシステムフォントの一瞬表示を防ぐ）。
// ウィジェットのヘッドレス起動でも本モジュールは import されるため、失敗は握りつぶす。
SplashScreen.preventAutoHideAsync().catch(() => undefined)

/** variant に応じたナビゲーション地色。gradient/ScreenBg を敷かない画面（科目詳細・各種ビューア）の下地になる。 */
function navTheme(variant: 'green' | 'white' | 'dark'): Theme {
  const background = variant === 'dark' ? DARK.bg : variant === 'green' ? COLORS.gradBottom : '#ffffff'
  return { ...DefaultTheme, colors: { ...DefaultTheme.colors, background } }
}

/** ダーク地では白飛びしないよう明色アイコンにする（翠/白は従来どおり auto）。 */
function ThemedStatusBar() {
  const { variant } = useThemeVariant()
  return <StatusBar style={variant === 'dark' ? 'light' : 'auto'} />
}

/** ThemeProvider配下でvariantを読み、NavigationContainerの地色をテーマ連動させるラッパ。 */
function ThemedContainer({ children }: { children: ReactNode }) {
  const { variant } = useThemeVariant()
  return (
    <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation} theme={navTheme(variant)}>
      {children}
    </NavigationContainer>
  )
}

export default function App() {
  // アプリ共通フォント（IBM Plex Sans JP）。ロード失敗時は fontError が立つので
  // ブロックせずシステムフォントで続行する（src/ui/Text.tsx がフォールバックを担う）。
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansJP_400Regular,
    IBMPlexSansJP_500Medium,
    IBMPlexSansJP_700Bold,
  })
  const fontsReady = fontsLoaded || fontError != null

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => undefined)
  }, [fontsReady])

  useEffect(() => {
    ;(async () => {
      try {
        await configureNotifications()
        await clearDeliveredBulletinNotifications()
        await requestNotificationPermission()
        await refreshAllNotifications()
      } catch (e) {
        console.warn('起動時の通知同期に失敗しました', e)
      }
    })()
    // 復帰時に貼り直す（日付を跨いだ古い予約の残留対策）。復帰オーケストレータの段階発火に乗せる。
    return subscribeForeground('notifications', () => refreshAllNotifications().catch(() => undefined))
  }, [])

  // 通知タップで対応画面を即開く。出席通知は出席画面、掲示通知は掲示一覧を開く。
  // cold start（起動時タップ）＋ warm（起動中タップ）の両対応。
  useEffect(() => {
    let sub: { remove: () => void } | null = null
    ;(async () => {
      try {
        const initialTag = await getInitialNotificationTag()
        if (initialTag === ATTENDANCE_TAG || initialTag === ATTENDANCE_OPEN_TAG) requestOpenAttendance()
        else if (initialTag === BULLETIN_TAG) requestOpenBulletins()
        sub = await addNotificationResponseListener((tag) => {
          if (tag === ATTENDANCE_TAG || tag === ATTENDANCE_OPEN_TAG) requestOpenAttendance()
          else if (tag === BULLETIN_TAG) requestOpenBulletins()
        })
      } catch (e) {
        console.warn('通知応答の購読に失敗しました', e)
      }
    })()
    return () => sub?.remove()
  }, [])

  // ウィジェットのタップ（litus:// ディープリンク）で対応画面を開く。cold/warm 両対応。
  useEffect(() => subscribeWidgetLinks(), [])

  // フォント確定前は描画しない（スプラッシュ保持中なので白画面にはならない）。
  // ローカルアセットのためロードは実質即時で、起動体感には影響しない。
  if (!fontsReady) return null

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* AuthProvider（LETUSウォームアップ）はLoginGateの内側に置く: 起動直後から裏SSOを走らせると、
            可視ログインのSSOフローと同一Cookie jarで並走してリレー先が混線し、ログイン後にLETUSへ
            着地して詰む実機バグがあった。ログイン完了後にのみ裏SSOを開始する。 */}
        <DisplaySettingsProvider>
        <AssignmentsVersionProvider>
        <ClassEventsVersionProvider>
          <ThemedContainer>
            {/* KillSwitchProviderはLoginGateの外側: all停止時はログインprobe用WebViewすら
                マウントさせない（リモート停止指示の設計: docs/2026-07-12-remote-kill-switch-design.md）。 */}
            <KillSwitchProvider>
              <LoginGate>
                <AuthProvider>
                  <ClassViewProvider>
                    <AttendanceEngineProvider>
                      <RootTabs />
                      <KillSwitchGate feature="letus">
                        <BackgroundLetusSync />
                      </KillSwitchGate>
                      <KillSwitchGate feature="bulletin">
                        <BackgroundBulletinSync />
                      </KillSwitchGate>
                    </AttendanceEngineProvider>
                  </ClassViewProvider>
                </AuthProvider>
              </LoginGate>
            </KillSwitchProvider>
          </ThemedContainer>
          <ThemedStatusBar />
        </ClassEventsVersionProvider>
        </AssignmentsVersionProvider>
        </DisplaySettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
