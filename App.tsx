import { SafeAreaView, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import TimetableCollectScreen from './src/screens/TimetableCollectScreen'

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <TimetableCollectScreen />
      <StatusBar style="auto" />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({ container: { flex: 1 } })
