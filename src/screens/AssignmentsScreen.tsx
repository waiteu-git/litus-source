import { StyleSheet, Text, View } from 'react-native'

export default function AssignmentsScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.note}>課題の収集は次の対応です</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  note: { color: '#666' },
})
