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
import { ThemeProvider } from './src/theme'
import { DisplaySettingsProvider } from './src/displaySettings'
import {
  addNotificationResponseListener,
  clearDeliveredBulletinNotifications,
  configureNotifications,
  getInitialNotificationTag,
  requestNotificationPermission,
} from './src/notifications/notifier'
import { refreshAllNotifications } from './src/notifications/notificationRefresh'
import { subscribeForeground } from './src/app/foregroundOrchestrator'
import { navigationRef, flushPendingNavigation, requestOpenAttendance, requestOpenBulletins } from './src/navigation/navigationRef'

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

  // 出席通知タップで出席画面を即開く。cold start（起動時タップ）＋ warm（起動中タップ）の両対応。
  useEffect(() => {
    let sub: { remove: () => void } | null = null
    ;(async () => {
      try {
        const initialTag = await getInitialNotificationTag()
        if (initialTag === ATTENDANCE_TAG) requestOpenAttendance()
        else if (initialTag === 'bulletin-new') requestOpenBulletins()
        sub = await addNotificationResponseListener((tag) => {
          if (tag === ATTENDANCE_TAG) requestOpenAttendance()
          else if (tag === 'bulletin-new') requestOpenBulletins()
        })
      } catch (e) {
        console.warn('通知応答の購読に失敗しました', e)
      }
    })()
    return () => sub?.remove()
  }, [])

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
            <LoginGate>
              <AuthProvider>
                <ClassViewProvider>
                  <AttendanceEngineProvider>
                    <RootTabs />
                    <BackgroundLetusSync />
                    <BackgroundBulletinSync />
                  </AttendanceEngineProvider>
                </ClassViewProvider>
              </AuthProvider>
            </LoginGate>
          </NavigationContainer>
          <StatusBar style="auto" />
        </ClassEventsVersionProvider>
        </AssignmentsVersionProvider>
        </DisplaySettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
