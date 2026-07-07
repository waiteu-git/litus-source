import { useEffect } from 'react'
import { AppState } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import RootTabs from './src/navigation/RootTabs'
import BackgroundLetusSync from './src/collect/BackgroundLetusSync'
import { AuthProvider } from './src/auth/AuthProvider'
import { AssignmentsVersionProvider } from './src/assignments/assignmentsVersion'
import { LoginGate } from './src/auth/LoginGate'
import { ThemeProvider } from './src/theme'
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
        <AuthProvider>
          <AssignmentsVersionProvider>
            <NavigationContainer>
              <LoginGate>
                <RootTabs />
                <BackgroundLetusSync />
              </LoginGate>
            </NavigationContainer>
          </AssignmentsVersionProvider>
          <StatusBar style="auto" />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
