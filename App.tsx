import { useEffect } from 'react'
import { AppState } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import RootTabs from './src/navigation/RootTabs'
import BackgroundLetusSync from './src/collect/BackgroundLetusSync'
import BackgroundBulletinSync from './src/collect/BackgroundBulletinSync'
import { ClassViewProvider } from './src/collect/classViewArbiter'
import { AuthProvider } from './src/auth/AuthProvider'
import { AssignmentsVersionProvider } from './src/assignments/assignmentsVersion'
import { LoginGate } from './src/auth/LoginGate'
import { ThemeProvider } from './src/theme'
import { DisplaySettingsProvider } from './src/displaySettings'
import { configureNotifications, requestNotificationPermission } from './src/notifications/notifier'
import { refreshAllNotifications } from './src/notifications/notificationRefresh'

export default function App() {
  useEffect(() => {
    ;(async () => {
      try {
        await configureNotifications()
        await requestNotificationPermission()
        await refreshAllNotifications()
      } catch (e) {
        console.warn('起動時の通知同期に失敗しました', e)
      }
    })()
    // 復帰時に貼り直す（日付を跨いだ古い予約の残留対策）。
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshAllNotifications().catch(() => undefined)
    })
    return () => sub.remove()
  }, [])

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* AuthProvider（LETUSウォームアップ）はLoginGateの内側に置く: 起動直後から裏SSOを走らせると、
            可視ログインのSSOフローと同一Cookie jarで並走してリレー先が混線し、ログイン後にLETUSへ
            着地して詰む実機バグがあった。ログイン完了後にのみ裏SSOを開始する。 */}
        <DisplaySettingsProvider>
        <AssignmentsVersionProvider>
          <NavigationContainer>
            <LoginGate>
              <AuthProvider>
                <ClassViewProvider>
                  <RootTabs />
                  <BackgroundLetusSync />
                  <BackgroundBulletinSync />
                </ClassViewProvider>
              </AuthProvider>
            </LoginGate>
          </NavigationContainer>
          <StatusBar style="auto" />
        </AssignmentsVersionProvider>
        </DisplaySettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
