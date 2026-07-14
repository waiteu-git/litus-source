import { useEffect, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../ui/Text'
import { clearTimetable, loadTimetable } from '../storage/timetableStore'
import { loadAttendanceSettings, saveAttendanceSettings } from '../storage/attendanceSettingsStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import type { AttendanceAlarmSettings } from '../notifications/attendanceSchedule'
import { loadBulletinNotifySettings, saveBulletinNotifySettings } from '../storage/bulletinNotifySettingsStore'
import type { BulletinNotifySettings } from '../notifications/bulletinNotify'
import {
  loadLetusNewsNotifySettings,
  saveLetusNewsNotifySettings,
} from '../storage/letusNewsNotifySettingsStore'
import { clearDismissedHints } from '../storage/dismissedHintsStore'
import type { LetusNewsNotifySettings } from '../notifications/letusNewsNotify'
import { ScreenBg, ScreenHeader, Segmented, useUi, useTabBarClearance } from '../ui/screen'
import { Accordion } from '../ui/Accordion'
import { COLORS, useThemeVariant, type ThemePreference } from '../theme'
import { FONT_LICENSE_TEXT, FONT_LICENSE_TITLE } from '../legal/fontLicense'
import { useDisplaySettings } from '../displaySettings'
import { HOME_SECTION_META, moveSection, toggleSection } from '../home/homeSections'
import Constants from 'expo-constants'
import { formatVersionLabel } from '../appVersion'
import { CHANGELOG, getRecentChangelog } from '../changelog'
import ChangelogModal from '../ui/ChangelogModal'

type Course = { courseCode: string; name: string }

export default function SettingsScreen() {
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { preference, setPreference } = useThemeVariant()
  const { timetableView, assignmentsView, homeLayout, setTimetableView, setAssignmentsView, setHomeLayout } =
    useDisplaySettings()
  const [courses, setCourses] = useState<Course[]>([])
  const [settings, setSettings] = useState<AttendanceAlarmSettings>({})
  const [bulletinNotify, setBulletinNotify] = useState<BulletinNotifySettings>({ enabled: true, mode: 'all' })
  const [letusNewsNotify, setLetusNewsNotify] = useState<LetusNewsNotifySettings>({ enabled: true })
  const [changelogOpen, setChangelogOpen] = useState(false)
  const recentChangelog = getRecentChangelog(CHANGELOG, 3)

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
      setBulletinNotify(await loadBulletinNotifySettings())
      setLetusNewsNotify(await loadLetusNewsNotifySettings())
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

  async function updateBulletinNotify(next: BulletinNotifySettings) {
    setBulletinNotify(next)
    try {
      await saveBulletinNotifySettings(next)
    } catch (e) {
      console.warn('掲示通知設定の保存に失敗しました', e)
    }
  }

  async function updateLetusNewsNotify(next: LetusNewsNotifySettings) {
    setLetusNewsNotify(next)
    try {
      await saveLetusNewsNotifySettings(next)
    } catch (e) {
      console.warn('LETUS更新通知設定の保存に失敗しました', e)
    }
  }

  async function onClear() {
    await clearTimetable()
    Alert.alert('消去しました', '保存した時間割データを消去しました。')
  }

  async function onResetHints() {
    try {
      await clearDismissedHints()
      Alert.alert('再表示します', '各画面を開くとヒントカードが再び表示されます。')
    } catch (e) {
      console.warn('ヒント再表示の設定に失敗しました', e)
    }
  }

  return (
    <ScreenBg>
      <ScreenHeader title="設定" icon="settings-outline" />
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]}>
        <Accordion title="テーマ" icon="color-palette-outline" defaultOpen>
          <Segmented
            options={[
              { key: 'green', label: '翠' },
              { key: 'white', label: '白' },
              { key: 'dark', label: 'ダーク' },
              { key: 'system', label: '自動' },
            ]}
            value={preference}
            onChange={(k) => setPreference(k as ThemePreference)}
          />
          <Text style={[styles.note, { color: ui.labelColor }]}>
            UIと起動アニメーションが選んだテーマに合わせて切り替わります。「自動」は端末のダークモード設定に追従します。
          </Text>
        </Accordion>

        <Accordion title="表示" icon="grid-outline" defaultOpen>
          <Text style={[styles.fieldLabel, { color: ui.labelColor }]}>時間割の表示</Text>
          <Segmented
            options={[
              { key: 'list', label: 'リスト' },
              { key: 'grid', label: 'グリッド' },
            ]}
            value={timetableView}
            onChange={setTimetableView}
          />
          <Text style={[styles.fieldLabel, { color: ui.labelColor, marginTop: 14 }]}>課題の並び</Text>
          <Segmented
            options={[
              { key: 'bucket', label: 'バケット別' },
              { key: 'flat', label: '締切順' },
            ]}
            value={assignmentsView}
            onChange={setAssignmentsView}
          />
        </Accordion>

        <Accordion title="ホームの並び" icon="reorder-three-outline">
          <Text style={[styles.note, { color: ui.labelColor, marginTop: 0, marginBottom: 6 }]}>
            ホーム画面のカードの順番と表示/非表示を変更できます。
          </Text>
          {homeLayout.map((s, i) => {
            const meta = HOME_SECTION_META[s.key]
            const first = i === 0
            const last = i === homeLayout.length - 1
            return (
              <View
                key={s.key}
                style={[styles.hlRow, i > 0 && { borderTopWidth: 1, borderTopColor: ui.dividerColor }]}
              >
                <Text style={[styles.hlLabel, { color: s.enabled ? ui.valueColor : ui.subMuted }]} numberOfLines={1}>
                  {meta.label}
                </Text>
                <View style={styles.hlBtns}>
                  <Pressable
                    onPress={() => setHomeLayout(moveSection(homeLayout, s.key, -1))}
                    disabled={first}
                    hitSlop={6}
                    style={styles.hlBtn}
                  >
                    <Ionicons name="chevron-up" size={20} color={first ? ui.chevron : ui.accent} />
                  </Pressable>
                  <Pressable
                    onPress={() => setHomeLayout(moveSection(homeLayout, s.key, 1))}
                    disabled={last}
                    hitSlop={6}
                    style={styles.hlBtn}
                  >
                    <Ionicons name="chevron-down" size={20} color={last ? ui.chevron : ui.accent} />
                  </Pressable>
                  {meta.fixedOn ? (
                    <View style={styles.hlBtn}>
                      <Ionicons name="lock-closed" size={15} color={ui.chevron} />
                    </View>
                  ) : (
                    <Pressable onPress={() => setHomeLayout(toggleSection(homeLayout, s.key))} hitSlop={6} style={styles.hlBtn}>
                      <Ionicons name={s.enabled ? 'eye-outline' : 'eye-off-outline'} size={20} color={s.enabled ? ui.accent : ui.subMuted} />
                    </Pressable>
                  )}
                </View>
              </View>
            )
          })}
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
                    trackColor={{
                      true: COLORS.emerald,
                      false: ui.pick(ui.colors.softBoxBg, ui.colors.softBoxBg, ui.colors.inputBorder),
                    }}
                    thumbColor={COLORS.white}
                  />
                </View>
              ))}
            </View>
          )}
        </Accordion>

        <Accordion title="新着掲示の通知" icon="notifications-outline">
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: ui.valueColor }]}>新着掲示を通知</Text>
            <Switch
              value={bulletinNotify.enabled}
              onValueChange={(v) => updateBulletinNotify({ ...bulletinNotify, enabled: v })}
              trackColor={{
                true: COLORS.emerald,
                false: ui.pick(ui.colors.softBoxBg, ui.colors.softBoxBg, ui.colors.inputBorder),
              }}
              thumbColor={COLORS.white}
            />
          </View>
          {bulletinNotify.enabled && (
            <>
              <Text style={[styles.fieldLabel, { color: ui.labelColor, marginTop: 10 }]}>通知する掲示</Text>
              <Segmented
                options={[
                  { key: 'all', label: 'すべて' },
                  { key: 'importantOnly', label: '重要のみ' },
                ]}
                value={bulletinNotify.mode}
                onChange={(k) => updateBulletinNotify({ ...bulletinNotify, mode: k as BulletinNotifySettings['mode'] })}
              />
            </>
          )}
          <Text style={[styles.note, { color: ui.labelColor }]}>
            新着掲示の通知はアプリを開いたときに確認されます。バックグラウンド自動取得は今後対応予定です。
          </Text>
        </Accordion>

        <Accordion title="LETUS更新の通知" icon="sparkles-outline">
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: ui.valueColor }]}>コースの新着を通知</Text>
            <Switch
              value={letusNewsNotify.enabled}
              onValueChange={(v) => updateLetusNewsNotify({ enabled: v })}
              trackColor={{
                true: COLORS.emerald,
                false: ui.pick(ui.colors.softBoxBg, ui.colors.softBoxBg, ui.colors.inputBorder),
              }}
              thumbColor={COLORS.white}
            />
          </View>
          <Text style={[styles.note, { color: ui.labelColor }]}>
            LETUSのコースに新しい教材・課題などが追加されたときに通知します。同期のタイミングで確認されます。
          </Text>
        </Accordion>

        <Accordion title="データ" icon="server-outline">
          <Pressable style={[ui.card, styles.rowBetween]} onPress={onClear}>
            <Text style={[styles.rowLabel, { color: ui.valueColor }]}>時間割データを消去</Text>
            <Text style={[styles.danger, { color: ui.colors.danger }]}>消去</Text>
          </Pressable>
          <Pressable style={[ui.card, styles.rowBetween, { marginTop: 8 }]} onPress={onResetHints}>
            <Text style={[styles.rowLabel, { color: ui.valueColor }]}>ヒントを再表示</Text>
            <Text style={[styles.rowAction, { color: ui.labelColor }]}>再表示</Text>
          </Pressable>
        </Accordion>

        <Accordion title="アプリ情報" icon="information-circle-outline">
          <View style={ui.card}>
            <Text style={{ color: ui.valueColor, fontWeight: '500' }}>
              リタス {formatVersionLabel(Constants.nativeAppVersion, Constants.nativeBuildVersion)}（開発版）
            </Text>
            <Pressable onPress={() => Linking.openURL('https://lms.waiteu.dev/app')}>
              <Text style={[styles.link, { color: ui.labelColor }]}>事前登録・お知らせ ↗</Text>
            </Pressable>
          </View>
          <View style={[ui.card, { marginTop: 8 }]}>
            <Text style={[styles.changelogHeading, { color: ui.valueColor }]}>変更履歴</Text>
            {recentChangelog.map((entry) => (
              <View key={entry.build} style={styles.changelogEntry}>
                <Text style={[styles.changelogEntryTitle, { color: ui.labelColor }]}>
                  build {entry.build}（{entry.date}）
                </Text>
                {entry.items.map((item, i) => (
                  <Text key={i} style={[styles.changelogItem, { color: ui.labelColor }]} numberOfLines={2}>
                    ・{item}
                  </Text>
                ))}
              </View>
            ))}
            {CHANGELOG.length > recentChangelog.length ? (
              <Pressable onPress={() => setChangelogOpen(true)}>
                <Text style={[styles.changelogMore, { color: ui.labelColor }]}>すべて見る ›</Text>
              </Pressable>
            ) : null}
          </View>
        </Accordion>

        <Accordion title="ライセンス" icon="document-text-outline">
          <View style={ui.card}>
            <Text style={{ color: ui.valueColor, fontWeight: '500' }}>{FONT_LICENSE_TITLE}</Text>
            <Text style={[styles.note, { color: ui.labelColor }]}>
              本アプリのUIフォントには {FONT_LICENSE_TITLE}（SIL Open Font License 1.1）を同梱しています。
            </Text>
            <Text style={[styles.licenseBody, { color: ui.labelColor }]}>{FONT_LICENSE_TEXT}</Text>
          </View>
        </Accordion>
      </ScrollView>
      <ChangelogModal visible={changelogOpen} entries={CHANGELOG} onClose={() => setChangelogOpen(false)} />
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, flex: 1, paddingRight: 12 },
  danger: { fontSize: 14, fontWeight: '500' },
  // 行右端の中立アクション（dangerと同メトリクス・下線なし。linkは外部リンク専用）。
  rowAction: { fontSize: 14, fontWeight: '500' },
  link: { fontSize: 13, textDecorationLine: 'underline', marginTop: 8 },
  note: { fontSize: 12, marginTop: 8, marginLeft: 2 },
  licenseBody: { fontSize: 10, lineHeight: 15, marginTop: 10 },
  fieldLabel: { fontSize: 13, marginLeft: 2, marginBottom: 2 },
  hlRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  hlLabel: { flex: 1, fontSize: 14, minWidth: 0 },
  hlBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hlBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  changelogHeading: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  changelogEntry: { marginBottom: 10 },
  changelogEntryTitle: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  changelogItem: { fontSize: 12, lineHeight: 17 },
  changelogMore: { fontSize: 13, fontWeight: '600', marginTop: 4 },
})
