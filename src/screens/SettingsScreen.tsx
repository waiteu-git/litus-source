import { useEffect, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { clearTimetable, loadTimetable } from '../storage/timetableStore'
import { loadAttendanceSettings, saveAttendanceSettings } from '../storage/attendanceSettingsStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import type { AttendanceAlarmSettings } from '../notifications/attendanceSchedule'
import { ScreenBg, ScreenHeader, Segmented, useUi } from '../ui/screen'
import { Accordion } from '../ui/Accordion'
import { COLORS, useThemeVariant, type ThemeVariant } from '../theme'

type Course = { courseCode: string; name: string }

export default function SettingsScreen() {
  const ui = useUi()
  const { variant, setVariant } = useThemeVariant()
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
    try {
      await saveAttendanceSettings(next)
      await refreshAllNotifications()
    } catch (e) {
      console.warn('出席アラーム設定の保存/同期に失敗しました', e)
    }
  }

  async function onClear() {
    await clearTimetable()
    Alert.alert('消去しました', '保存した時間割データを消去しました。')
  }

  return (
    <ScreenBg>
      <ScreenHeader title="設定" icon="settings-outline" />
      <ScrollView contentContainerStyle={styles.list}>
        <Accordion title="テーマ" icon="color-palette-outline" defaultOpen>
          <Segmented
            options={[
              { key: 'green', label: '翠' },
              { key: 'white', label: '白' },
            ]}
            value={variant}
            onChange={(k) => setVariant(k as ThemeVariant)}
          />
          <Text style={[styles.note, { color: ui.labelColor }]}>
            UIと起動アニメーションが選んだテーマに合わせて切り替わります。
          </Text>
        </Accordion>

        <Accordion title="出席アラーム（科目別）" icon="notifications-outline">
          {courses.length === 0 ? (
            <View style={ui.card}>
              <Text style={{ color: ui.valueColor }}>時間割を収集すると科目が表示されます。</Text>
            </View>
          ) : (
            <View style={ui.card}>
              {courses.map((c, i) => (
                <View
                  key={c.courseCode}
                  style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: ui.dividerColor }]}
                >
                  <Text style={[styles.rowLabel, { color: ui.valueColor }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Switch
                    value={settings[c.courseCode] !== false}
                    onValueChange={(v) => toggle(c.courseCode, v)}
                    trackColor={{ true: COLORS.emerald, false: '#c9d6d0' }}
                    thumbColor="#ffffff"
                  />
                </View>
              ))}
            </View>
          )}
        </Accordion>

        <Accordion title="データ" icon="server-outline">
          <Pressable style={[ui.card, styles.rowBetween]} onPress={onClear}>
            <Text style={[styles.rowLabel, { color: ui.valueColor }]}>時間割データを消去</Text>
            <Text style={styles.danger}>消去</Text>
          </Pressable>
        </Accordion>

        <Accordion title="アプリ情報" icon="information-circle-outline">
          <View style={ui.card}>
            <Text style={{ color: ui.valueColor, fontWeight: '500' }}>リタス v1.0.0（開発版）</Text>
            <Pressable onPress={() => Linking.openURL('https://lms.waiteu.dev/app')}>
              <Text style={[styles.link, { color: ui.labelColor }]}>事前登録・お知らせ ↗</Text>
            </Pressable>
          </View>
        </Accordion>
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, flex: 1, paddingRight: 12 },
  danger: { color: '#b3261e', fontSize: 14, fontWeight: '500' },
  link: { fontSize: 13, textDecorationLine: 'underline', marginTop: 8 },
  note: { fontSize: 12, marginTop: 8, marginLeft: 2 },
})
