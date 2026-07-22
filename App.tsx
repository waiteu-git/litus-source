import { useEffect, useState, type ReactNode } from 'react'
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
import BackgroundAttendanceStatsSync from './src/collect/BackgroundAttendanceStatsSync'
import { ClassViewProvider } from './src/collect/classViewArbiter'
import { AttendanceEngineProvider } from './src/attendance/AttendanceEngineProvider'
import AttendanceFab from './src/attendance/AttendanceFab'
import { AuthProvider } from './src/auth/AuthProvider'
import { AssignmentsVersionProvider } from './src/assignments/assignmentsVersion'
import { ClassEventsVersionProvider } from './src/timetableEvents/classEventsVersion'
import { AttendanceVersionProvider } from './src/attendance/attendanceVersion'
import { LoginGate } from './src/auth/LoginGate'
import { KillSwitchGate, KillSwitchProvider } from './src/health/KillSwitchProvider'
import { SyncProvider } from './src/sync/SyncProvider'
import { DemoProvider, useDemo } from './src/demo/DemoProvider'
import { DemoBanner } from './src/demo/DemoBanner'
import { ThemeProvider, useThemeVariant, COLORS, DARK } from './src/theme'
import { statusBarStyleFor } from './src/theme.tokens'
import { DisplaySettingsProvider } from './src/displaySettings'
import {
  addNotificationResponseListener,
  clearConsumedNotificationResponse,
  clearDeliveredBulletinNotifications,
  clearDeliveredLetusNewsNotifications,
  configureNotifications,
  getInitialNotificationPayload,
} from './src/notifications/notifier'
import { routeForNotification } from './src/notifications/notificationRoute'
import { dispatchNotificationRoute } from './src/navigation/notificationDispatch'
import { refreshAllNotifications } from './src/notifications/notificationRefresh'
import { subscribeForeground } from './src/app/foregroundOrchestrator'
import { navigationRef, flushPendingNavigation } from './src/navigation/navigationRef'
import { subscribeWidgetLinks } from './src/widget/widgetLinking'

// フォントロードがまれに解決も棄却もしない端末があっても、この時間で強制的に起動を続行する
// （バンドル同梱アセットのため通常は即時。スプラッシュに永久に留まる事故を防ぐ保険）。
const FONT_LOAD_TIMEOUT_MS = 4000

// フォントロード完了までネイティブスプラッシュを保持する（白画面やシステムフォントの一瞬表示を防ぐ）。
// ウィジェットのヘッドレス起動でも本モジュールは import されるため、失敗は握りつぶす。
SplashScreen.preventAutoHideAsync().catch(() => undefined)

/** variant に応じたナビゲーション地色。gradient/ScreenBg を敷かない画面（科目詳細・各種ビューア）の下地になる。 */
function navTheme(variant: 'green' | 'white' | 'dark'): Theme {
  const background = variant === 'dark' ? DARK.bg : variant === 'green' ? COLORS.gradBottom : '#ffffff'
  return { ...DefaultTheme, colors: { ...DefaultTheme.colors, background } }
}

/**
 * バーアイコン色はアプリの variant から決める。'auto' は expo-status-bar が OS の外観だけで
 * 解決するため、OSダーク × アプリ「白」で白アイコンが白地に乗り不可視になっていた。
 */
function ThemedStatusBar() {
  const { variant } = useThemeVariant()
  return <StatusBar style={statusBarStyleFor(variant)} />
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
  // タイムアウト保険。useFonts が万一決着しなくても FONT_LOAD_TIMEOUT_MS で起動を続行させる。
  const [fontTimedOut, setFontTimedOut] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setFontTimedOut(true), FONT_LOAD_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [])
  const fontsReady = fontsLoaded || fontError != null || fontTimedOut

  useEffect(() => {
    ;(async () => {
      try {
        await configureNotifications()
        await clearDeliveredBulletinNotifications()
        await clearDeliveredLetusNewsNotifications()
        // 通知権限の要求はここでは行わない。ここはブート最初のフレームで走るため、
        // 規約同意画面やオンボーディング1枚目の上にOSダイアログが被さっていた
        // （通知の価値を説明するスライド3枚目より前にダイアログが出る＝事前説明ゼロ）。
        // Android は2回拒否されると以後ダイアログを出せないので、この1回は無駄にできない。
        // 要求は LoginGate のオンボーディング完了時に移した。
        await refreshAllNotifications()
      } catch (e) {
        console.warn('起動時の通知同期に失敗しました', e)
      }
    })()
    // 復帰時に貼り直す（日付を跨いだ古い予約の残留対策）。復帰オーケストレータの段階発火に乗せる。
    return subscribeForeground('notifications', () => refreshAllNotifications().catch(() => undefined))
  }, [])

  // 通知タップで対応画面を即開く。着地先の判断は純粋層 routeForNotification が持つ。
  // cold start（起動時タップ）＋ warm（起動中タップ）の両対応。
  useEffect(() => {
    let sub: { remove: () => void } | null = null
    ;(async () => {
      try {
        const initial = await getInitialNotificationPayload()
        dispatchNotificationRoute(routeForNotification(initial))
        // 消費した応答は破棄する。残すと以後の通常起動でも毎回同じ画面へ飛ぶ。
        if (initial) await clearConsumedNotificationResponse()
        sub = await addNotificationResponseListener((p) => {
          dispatchNotificationRoute(routeForNotification(p))
        })
      } catch (e) {
        console.warn('通知応答の購読に失敗しました', e)
      }
    })()
    return () => sub?.remove()
  }, [])

  // ウィジェットのタップ（litus:// ディープリンク）で対応画面を開く。cold/warm 両対応。
  useEffect(() => subscribeWidgetLinks(), [])

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* フォントとテーマ復元の両方が済むまでスプラッシュを保持（BootGate）。テーマ復元前に描くと
            保存済みダークでも既定の白テーマで初回フレームが描かれ白フラッシュになるため。 */}
        <BootGate fontsReady={fontsReady}>
        {/* AuthProvider（LETUSウォームアップ）はLoginGateの内側に置く: 起動直後から裏SSOを走らせると、
            可視ログインのSSOフローと同一Cookie jarで並走してリレー先が混線し、ログイン後にLETUSへ
            着地して詰む実機バグがあった。ログイン完了後にのみ裏SSOを開始する。 */}
        <DisplaySettingsProvider>
        <AssignmentsVersionProvider>
        <ClassEventsVersionProvider>
        <AttendanceVersionProvider>
          <ThemedContainer>
            {/* KillSwitchProviderはLoginGateの外側: all停止時はログインprobe用WebViewすら
                マウントさせない（リモート停止指示の設計: docs/2026-07-12-remote-kill-switch-design.md）。 */}
            {/* DemoProvider は KillSwitchProvider より外側: 停止指示の照会もデモ中は行わない
                （「デモ中はネットワークに一切出ない」の一部）ため、KillSwitchProvider が
                useDemo() を読める位置に置く。 */}
            <DemoProvider>
              <KillSwitchProvider>
                <AppShell />
              </KillSwitchProvider>
            </DemoProvider>
          </ThemedContainer>
          <ThemedStatusBar />
        </AttendanceVersionProvider>
        </ClassEventsVersionProvider>
        </AssignmentsVersionProvider>
        </DisplaySettingsProvider>
        </BootGate>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

/**
 * ログインゲートの内側（＝通信を伴う層）。デモモードでは LoginGate を丸ごと外す。
 *
 * LoginGate の WebView は showLoginUi に関わらず**常時マウント**されており
 * （セッション判定 probe を兼ねる）、描画したままではデモ中も大学へ通信する。
 * したがって「デモ中は通信ゼロ」を満たすには LoginGate をツリーから外すしかない。
 *
 * 一方 AttendanceEngineProvider / SyncProvider / ClassViewProvider は**外せない**。
 * useAttendanceEngine() は Provider 不在で throw し、ホーム・時間割・出席の各画面が
 * これを使うため、外すとデモのタブが即クラッシュする。これらは context を供給したまま
 * 各自の内部で WebView と収集を停止する（各ファイルの useDemo() ガードを参照）。
 * 背景同期3本は runner を呼ぶだけの薄いトリガなので、デモではマウントしない。
 */
function AppShell() {
  const { active: demo } = useDemo()

  const inner = (
    <ClassViewProvider>
      <AttendanceEngineProvider>
        {/* SyncProviderが掲示/課題の収集エンジンを単独所有（マウント・完了処理・kill反映）。
            背景2件は runner を呼ぶだけの薄いトリガ（Gateで包む＝停止中はトリガ自体を眠らせる）。 */}
        <SyncProvider>
          {demo ? <DemoBanner /> : null}
          <RootTabs />
          {/* 全画面共通の出席フローティングボタン（受付中/授業時間帯・ホーム/出席画面では非表示）。 */}
          <AttendanceFab />
          {demo ? null : (
            <>
              <KillSwitchGate feature="letus">
                <BackgroundLetusSync />
              </KillSwitchGate>
              <KillSwitchGate feature="bulletin">
                <BackgroundBulletinSync />
              </KillSwitchGate>
              {/* 出欠もCLASS収集なので掲示のkillキーに追従する（出欠専用キーは無い）。 */}
              <KillSwitchGate feature="bulletin">
                <BackgroundAttendanceStatsSync />
              </KillSwitchGate>
            </>
          )}
        </SyncProvider>
      </AttendanceEngineProvider>
    </ClassViewProvider>
  )

  if (demo) return inner
  return (
    <LoginGate>
      <AuthProvider>{inner}</AuthProvider>
    </LoginGate>
  )
}

/**
 * フォントとテーマ復元の両方が完了するまでネイティブスプラッシュを保持し、下流を描画しない。
 * 復元前に描画すると保存済みダークでも既定の白テーマで一瞬描かれる（起動時の白フラッシュ）。
 * 両readyでスプラッシュを閉じ、以後は復元済み variant で初回フレームを描く。
 */
function BootGate({ fontsReady, children }: { fontsReady: boolean; children: ReactNode }) {
  const { ready } = useThemeVariant()
  const appReady = fontsReady && ready
  useEffect(() => {
    if (appReady) SplashScreen.hideAsync().catch(() => undefined)
  }, [appReady])
  if (!appReady) return null
  return <>{children}</>
}
