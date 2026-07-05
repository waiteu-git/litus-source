import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import RootTabs from './src/navigation/RootTabs'

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootTabs />
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  )
}
