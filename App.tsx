import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import RootTabs from './src/navigation/RootTabs'
import { requestNotificationPermission } from './src/notifications/notifier'
import { refreshAttendanceAlarms } from './src/notifications/attendanceSync'

export default function App() {
  useEffect(() => {
    ;(async () => {
      await requestNotificationPermission()
      await refreshAttendanceAlarms()
    })()
  }, [])

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootTabs />
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}
