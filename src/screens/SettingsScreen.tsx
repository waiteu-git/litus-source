import { useEffect, useState } from 'react'
import { Alert, BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
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
import { resetAllData } from '../storage/resetAll'
import type { LetusNewsNotifySettings } from '../notifications/letusNewsNotify'
import { ScreenBg, ScreenHeader, Segmented, useUi, useTabBarClearance } from '../ui/screen'
import { Accordion } from '../ui/Accordion'
import { COLORS, useThemeVariant, type ThemePreference } from '../theme'
import { FONT_LICENSE_TEXT, FONT_LICENSE_TITLE } from '../legal/fontLicense'
import { useDisplaySettings } from '../displaySettings'
import SectionLayoutReorder from '../ui/SectionLayoutReorder'
import { HOME_LAYOUT_OPS, HOME_SECTION_META } from '../home/homeSections'
import { SUBJECT_LAYOUT_OPS, SUBJECT_SECTION_META } from '../subject/subjectSections'
import Constants from 'expo-constants'
import { formatVersionLabel } from '../appVersion'
import { RELEASE_STAGE, devBadgeSuffix } from '../releaseStage'
import { formatSubmitDiag, type SubmitDiag } from '../attendance/submitDiag'
import { clearSubmitDiags, loadSubmitDiags } from '../storage/submitDiagStore'
import { useSync } from '../sync/SyncProvider'
import { useDemo } from '../demo/DemoProvider'
import { attendanceStatsDiagLine } from '../health/attendanceStatsDiag'
import { CHANGELOG, getRecentChangelog } from '../changelog'
import ChangelogModal from '../ui/ChangelogModal'

type Course = { courseCode: string; name: string }

export default function SettingsScreen() {
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { preference, setPreference } = useThemeVariant()
  // 出欠状況の取得ぐあい（前回成功時刻・失敗理由）を診断行に出すため。
  const { attendanceStatsHealth, lastAttendanceStatsAt } = useSync()
  const { active: demo, enter: enterDemo } = useDemo()
  const {
    timetableView,
    assignmentsView,
    homeLayout,
    subjectLayout,
    setTimetableView,
    setAssignmentsView,
    setHomeLayout,
    setSubjectLayout,
  } = useDisplaySettings()
  const [courses, setCourses] = useState<Course[]>([])
  const [settings, setSettings] = useState<AttendanceAlarmSettings>({})
  const [bulletinNotify, setBulletinNotify] = useState<BulletinNotifySettings>({ enabled: true, mode: 'all' })
  const [letusNewsNotify, setLetusNewsNotify] = useState<LetusNewsNotifySettings>({ enabled: true })
  const [changelogOpen, setChangelogOpen] = useState(false)
  // 出席送信の記録（真因未特定の間欠バグの証拠。開いた時だけ読み込む）。
  const [diags, setDiags] = useState<SubmitDiag[]>([])
  const [showDiags, setShowDiags] = useState(false)
  // ホームの並びをドラッグ中は親 ScrollView のスクロールを止める（縦ジェスチャ競合の回避）。
  const [reordering, setReordering] = useState(false)
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

  async function onToggleDiags() {
    const next = !showDiags
    setShowDiags(next)
    if (next) setDiags(await loadSubmitDiags().catch(() => []))
  }

  async function onClearDiags() {
    try {
      await clearSubmitDiags()
      setDiags([])
    } catch (e) {
      console.warn('出席送信の記録の消去に失敗しました', e)
    }
  }

  async function onResetHints() {
    try {
      await clearDismissedHints()
      Alert.alert('再表示します', '各画面を開くとヒントカードが再び表示されます。')
    } catch (e) {
      console.warn('ヒント再表示の設定に失敗しました', e)
    }
  }

  // 端末内の保存データをリセット。破壊的なので二段階で確認する。
  // **Cookie（SSOログイン状態）は消えない**（resetAll.ts のコメント参照＝消去手段が現状ない）。
  // ここで「Cookie含む」「ログインからやり直し」と書くと、実装で裏の取れない主張になり、
  // ストアのデータセーフティ申告へ転記した時点で虚偽記載になる。文言は実装に合わせること。
  function onResetAll() {
    Alert.alert(
      'すべてのデータをリセット',
      '時間割・課題・掲示・設定・保存済みデータをすべて消去します。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '次へ', style: 'destructive', onPress: confirmResetAll },
      ],
    )
  }
  function confirmResetAll() {
    Alert.alert(
      '本当にリセットしますか？',
      '消去後はアプリを終了します。次回起動時は規約の同意からやり直しになります。\n\n' +
        'なお、LETUS・CLASSへのログイン状態（Cookie）はこの操作では消えません。' +
        'ログインも解除したい場合は、端末の「設定 → アプリ → リタス → ストレージ → データを削除」を実行してください。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'リセットして終了', style: 'destructive', onPress: doResetAll },
      ],
    )
  }
  async function doResetAll() {
    try {
      await resetAllData()
    } catch (e) {
      console.warn('データのリセットに失敗しました', e)
      Alert.alert('失敗しました', 'データのリセットに失敗しました。もう一度お試しください。')
      return
    }
    if (Platform.OS === 'android') {
      Alert.alert('リセットしました', 'アプリを終了します。もう一度起動してください。', [
        { text: 'OK', onPress: () => BackHandler.exitApp() },
      ])
    } else {
      Alert.alert('リセットしました', 'アプリを一度終了してから、もう一度起動してください。')
    }
  }

  return (
    <ScreenBg>
      <ScreenHeader title="設定" icon="settings-outline" />
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]} scrollEnabled={!reordering}>
        <Accordion title="表示" icon="grid-outline" defaultOpen>
          <Text style={[styles.subHead, { color: ui.valueColor }]}>テーマ</Text>
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

          <Text style={[styles.subHead, { color: ui.valueColor, marginTop: 18 }]}>時間割の表示</Text>
          <Segmented
            options={[
              { key: 'list', label: 'リスト' },
              { key: 'grid', label: 'グリッド' },
            ]}
            value={timetableView}
            onChange={setTimetableView}
          />

          <Text style={[styles.subHead, { color: ui.valueColor, marginTop: 18 }]}>課題の並び</Text>
          <Segmented
            options={[
              { key: 'bucket', label: 'バケット別' },
              { key: 'flat', label: '締切順' },
            ]}
            value={assignmentsView}
            onChange={setAssignmentsView}
          />

          <Text style={[styles.subHead, { color: ui.valueColor, marginTop: 18 }]}>ホームの並び</Text>
          <SectionLayoutReorder
            layout={homeLayout}
            meta={HOME_SECTION_META}
            ops={HOME_LAYOUT_OPS}
            onChange={setHomeLayout}
            onDragActive={setReordering}
          />

          <Text style={[styles.subHead, { color: ui.valueColor, marginTop: 18 }]}>科目詳細の並び</Text>
          <SectionLayoutReorder
            layout={subjectLayout}
            meta={SUBJECT_SECTION_META}
            ops={SUBJECT_LAYOUT_OPS}
            onChange={setSubjectLayout}
            onDragActive={setReordering}
          />
        </Accordion>

        <Accordion title="通知" icon="notifications-outline">
          <Text style={[styles.subHead, { color: ui.valueColor }]}>新着掲示</Text>
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

          <Text style={[styles.subHead, { color: ui.valueColor, marginTop: 18 }]}>LETUS更新</Text>
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

          <Text style={[styles.subHead, { color: ui.valueColor, marginTop: 18 }]}>出席アラーム（科目別）</Text>
          <Text style={[styles.note, { color: ui.labelColor }]}>
            授業の開始時と終了前にお知らせします。OFFにした科目は、出席の受付が始まったときのお知らせも止まります。
          </Text>
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

          {/* 出欠状況の取得ぐあいを可視化する。収集ヘルスは保存していたのにUIに出ておらず、
              「授業時間外でも取れない」の原因（競合／ログイン切れ／構造変化）をユーザーも開発者も
              確認できなかった（2026-07-18）。ここで前回取得時刻と失敗理由を1行で示す。 */}
          <Text style={[styles.subHead, { color: ui.valueColor, marginTop: 18 }]}>出欠状況の取得</Text>
          <View style={ui.card}>
            <Text style={[styles.rowLabel, { color: ui.valueColor }]}>
              {attendanceStatsDiagLine({
                health: attendanceStatsHealth?.health ?? null,
                lastSuccessAt: lastAttendanceStatsAt,
                now: new Date(),
              })}
            </Text>
          </View>
        </Accordion>

        <Accordion title="データ" icon="server-outline">
          <Pressable style={[ui.card, styles.rowBetween]} onPress={onClear}>
            <Text style={[styles.rowLabel, { color: ui.valueColor }]}>時間割データを消去</Text>
            <Text style={[styles.danger, { color: ui.colors.danger }]}>消去</Text>
          </Pressable>
          {/* デモ導線。ログイン画面にも置いているが、**セッションが生きているとログイン画面に
              到達しない**（Cookie は resetAll でも消えない）ため、ここが実質唯一の入口になる。
              審査員が既にログイン済みの状態から入る経路としても効く。 */}
          {demo ? null : (
            <Pressable style={[ui.card, styles.rowBetween, { marginTop: 8 }]} onPress={() => void enterDemo()}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.rowLabel, { color: ui.valueColor }]}>デモを表示する</Text>
                <Text style={[styles.note, { color: ui.labelColor, marginTop: 4, marginLeft: 0 }]}>
                  サンプルデータで全機能を確認できます。実際のデータには影響しません。
                </Text>
              </View>
              <Text style={[styles.rowAction, { color: ui.labelColor }]}>表示</Text>
            </Pressable>
          )}
          <Pressable style={[ui.card, styles.rowBetween, { marginTop: 8 }]} onPress={onResetHints}>
            <Text style={[styles.rowLabel, { color: ui.valueColor }]}>ヒントを再表示</Text>
            <Text style={[styles.rowAction, { color: ui.labelColor }]}>再表示</Text>
          </Pressable>
          <Pressable style={[ui.card, styles.rowBetween, { marginTop: 8 }]} onPress={onResetAll}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: ui.valueColor }]}>すべてのデータをリセット</Text>
              <Text style={[styles.note, { color: ui.labelColor, marginTop: 4, marginLeft: 0 }]}>
                時間割・課題・掲示・設定・保存済みデータをすべて消去します。
              </Text>
            </View>
            <Text style={[styles.danger, { color: ui.colors.danger }]}>リセット</Text>
          </Pressable>
          {/* 出席送信の記録: 実機で間欠的に登録されない事象の真因が未特定のため、成功も失敗も
              自動で貯めて後から見返せるようにしている（その瞬間に気づけなくても証拠が残る）。
              認証コードそのものは記録しない。 */}
          <Pressable style={[ui.card, styles.rowBetween, { marginTop: 8 }]} onPress={onToggleDiags}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: ui.valueColor }]}>出席送信の記録</Text>
              <Text style={[styles.note, { color: ui.labelColor, marginTop: 4, marginLeft: 0 }]}>
                直近{diags.length}件。うまく登録できなかった時は、この内容を開発者にお知らせください。
              </Text>
            </View>
            <Text style={[styles.rowAction, { color: ui.labelColor }]}>{showDiags ? '閉じる' : '表示'}</Text>
          </Pressable>
          {showDiags ? (
            <View style={[ui.card, { marginTop: 8 }]}>
              {diags.length === 0 ? (
                <Text style={[styles.note, { color: ui.labelColor, marginLeft: 0 }]}>まだ記録はありません。</Text>
              ) : (
                <>
                  <Text selectable style={[styles.diagLog, { color: ui.valueColor }]}>
                    {diags.map((d) => formatSubmitDiag(d)).join('\n\n')}
                  </Text>
                  <Pressable style={[styles.rowBetween, { marginTop: 10 }]} onPress={onClearDiags}>
                    <Text style={[styles.rowLabel, { color: ui.labelColor }]}>記録を消去</Text>
                    <Text style={[styles.rowAction, { color: ui.labelColor }]}>消去</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
        </Accordion>

        <Accordion title="アプリ情報" icon="information-circle-outline">
          <View style={ui.card}>
            <Text style={{ color: ui.valueColor, fontWeight: '500' }}>
              リタス {formatVersionLabel(Constants.nativeAppVersion, Constants.nativeBuildVersion)}
              {devBadgeSuffix(RELEASE_STAGE)}
            </Text>
            <Pressable onPress={() => Linking.openURL('https://litus.waiteu.dev/')}>
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
  diagLog: { fontSize: 10, lineHeight: 15 },
  licenseBody: { fontSize: 10, lineHeight: 15, marginTop: 10 },
  fieldLabel: { fontSize: 13, marginLeft: 2, marginBottom: 2 },
  // 集約アコーディオン内の小見出し（表示=テーマ/時間割/課題/ホーム、通知=掲示/LETUS/出席）。
  subHead: { fontSize: 13, fontWeight: '700', marginLeft: 2, marginBottom: 6 },
  changelogHeading: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  changelogEntry: { marginBottom: 10 },
  changelogEntryTitle: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  changelogItem: { fontSize: 12, lineHeight: 17 },
  changelogMore: { fontSize: 13, fontWeight: '600', marginTop: 4 },
})
