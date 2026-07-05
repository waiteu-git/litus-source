import { useEffect, useState } from 'react'
import { Alert, Button, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { clearTimetable, loadTimetable } from '../storage/timetableStore'
import { loadAttendanceSettings, saveAttendanceSettings } from '../storage/attendanceSettingsStore'
import { refreshAttendanceAlarms } from '../notifications/attendanceSync'
import type { AttendanceAlarmSettings } from '../notifications/attendanceSchedule'

type Course = { courseCode: string; name: string }

export default function SettingsScreen() {
  const [courses, setCourses] = useState<Course[]>([])
  const [settings, setSettings] = useState<AttendanceAlarmSettings>({})

  useEffect(() => {
    ;(async () => {
      const collections = await loadTimetable()
      const seen = new Map<string, string>()
      for (const col of collections ?? []) {
        for (const slot of col.slots) {
          for (const c of slot.classes) {
            if (c.courseCode && !seen.has(c.courseCode)) seen.set(c.courseCode, c.name)
          }
        }
      }
      setCourses([...seen].map(([courseCode, name]) => ({ courseCode, name })))
      setSettings(await loadAttendanceSettings())
    })()
  }, [])

  async function toggle(courseCode: string, enabled: boolean) {
    const next = { ...settings, [courseCode]: enabled }
    setSettings(next)
    await saveAttendanceSettings(next)
    await refreshAttendanceAlarms()
  }

  async function onClear() {
    await clearTimetable()
    Alert.alert('消去しました', '保存した時間割データを消去しました。')
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.heading}>出席アラーム（科目別）</Text>
      {courses.length === 0 ? (
        <Text style={styles.info}>時間割を収集すると科目が表示されます。</Text>
      ) : (
        courses.map((c) => (
          <View key={c.courseCode} style={styles.row}>
            <Text style={styles.courseName}>{c.name}</Text>
            <Switch
              value={settings[c.courseCode] !== false}
              onValueChange={(v) => toggle(c.courseCode, v)}
            />
          </View>
        ))
      )}
      <View style={styles.spacer} />
      <Button title="時間割データを消去" onPress={onClear} />
      <Text style={styles.info}>LETUS課題ウォッチャー v2.0.0（開発版）</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { padding: 16 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  courseName: { flex: 1, paddingRight: 12 },
  spacer: { height: 24 },
  info: { color: '#666', marginTop: 16 },
})
