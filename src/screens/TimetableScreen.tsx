import { useCallback, useState } from 'react'
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { loadTimetable } from '../storage/timetableStore'
import type { TimetableCollection } from '../collect/timetableMessage'
import type { TimetableStackParamList } from '../navigation/types'

const DAY_LABEL: Record<string, string> = {
  mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土',
}

export default function TimetableScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const [collections, setCollections] = useState<TimetableCollection[] | null>(null)

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadTimetable().then((c) => {
        if (active) setCollections(c)
      })
      return () => {
        active = false
      }
    }, []),
  )

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <Button title="更新" onPress={() => navigation.navigate('Collect')} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!collections || collections.length === 0 ? (
          <Text style={styles.empty}>まだ収集していません。「更新」から収集してください。</Text>
        ) : (
          collections.map((c, i) => (
            <View key={i} style={styles.collection}>
              <Text style={styles.campus}>
                時間割{i + 1}（{c.slots.length}コマ）
                {c.periodTimes ? ` ・ ${c.periodTimes.campus}` : ''}
              </Text>
              {c.slots.map((s) => (
                <Text key={`${i}-${s.day}-${s.period}`} style={styles.row}>
                  {DAY_LABEL[s.day]}
                  {s.period}: {s.classes.map((cl) => `${cl.name}（${cl.room}）`).join(' / ')}
                </Text>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { padding: 8 },
  content: { padding: 12 },
  empty: { color: '#666' },
  collection: { marginBottom: 12 },
  campus: { fontWeight: '600', marginBottom: 6 },
  row: { marginBottom: 4 },
})
