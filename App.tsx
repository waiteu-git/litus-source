import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
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
import { ThemeProvider } from './src/theme'
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

export default function App() {
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

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* AuthProvider（LETUSウォームアップ）はLoginGateの内側に置く: 起動直後から裏SSOを走らせると、
            可視ログインのSSOフローと同一Cookie jarで並走してリレー先が混線し、ログイン後にLETUSへ
            着地して詰む実機バグがあった。ログイン完了後にのみ裏SSOを開始する。 */}
        <DisplaySettingsProvider>
        <AssignmentsVersionProvider>
        <ClassEventsVersionProvider>
          <NavigationContainer ref={navigationRef} onReady={flushPendingNavigation}>
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
          </NavigationContainer>
          <StatusBar style="auto" />
        </ClassEventsVersionProvider>
        </AssignmentsVersionProvider>
        </DisplaySettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
