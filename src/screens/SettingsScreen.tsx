import { Alert, Button, StyleSheet, Text, View } from 'react-native'
import { clearTimetable } from '../storage/timetableStore'

export default function SettingsScreen() {
  async function onClear() {
    await clearTimetable()
    Alert.alert('消去しました', '保存した時間割データを消去しました。')
  }

  return (
    <View style={styles.root}>
      <Button title="時間割データを消去" onPress={onClear} />
      <Text style={styles.info}>LETUS課題ウォッチャー v2.0.0（開発版）</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  info: { color: '#666', marginTop: 16 },
})
