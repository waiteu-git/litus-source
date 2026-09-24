import { useEffect, useState, type ReactNode } from 'react'
import { Alert, BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { useNavigation, type NavigationProp } from '@react-navigation/native'
import type { HomeStackParamList } from '../navigation/types'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { clearTimetable, loadTimetable } from '../storage/timetableStore'
import { loadAttendanceSettings, saveAttendanceSettings } from '../storage/attendanceSettingsStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import NotificationPermissionNotice from '../notifications/NotificationPermissionNotice'
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
import { LinkRow } from '../ui/LinkRow'
import { COLORS, useThemeVariant, type ThemePreference } from '../theme'
import { TYPE, SPACE } from '../ui/scale'
import { FONT_LICENSE_TITLE } from '../legal/fontLicense'
import { useDisplaySettings } from '../displaySettings'
import { toExamCountdownStart } from '../storage/displaySettingsSerialize'
import * as Application from 'expo-application'
import { formatVersionLabel } from '../appVersion'
import { RELEASE_STAGE, devBadgeSuffix, isPrerelease } from '../releaseStage'
import { formatSubmitDiag, type SubmitDiag } from '../attendance/submitDiag'
import { clearSubmitDiags, loadSubmitDiags } from '../storage/submitDiagStore'
import { useSync } from '../sync/SyncProvider'
import { useDemo } from '../demo/DemoProvider'
import { attendanceStatsDiagLine } from '../health/attendanceStatsDiag'
import { CHANGELOG, formatChangelogHeading, getRecentChangelog } from '../changelog'
import ChangelogModal from '../ui/ChangelogModal'
import FeedbackSheet from '../report/FeedbackSheet'
import { showStoreReviewLink, storeReviewUrl } from '../review/storeReviewLink'

type Course = { courseCode: string; name: string }

// アコーディオン本文内の小セクションを区切る。2番目以降は上に区切り線を足す
// （tier③＝設定「データ」の行・科目詳細の予定リストと同じ規約）。最初のセクションは境界なし。
function SubSection({ first, children }: { first?: boolean; children: ReactNode }) {
  const ui = useUi()
  return (
    <View
      style={[
        !first && { marginTop: SPACE.s3, paddingTop: SPACE.s3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor },
      ]}
    >
      {children}
    </View>
  )
}

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp<HomeStackParamList>>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { preference, setPreference } = useThemeVariant()
  // 出欠状況の取得ぐあい（前回成功時刻・失敗理由）を診断行に出すため。
  const { attendanceStatsHealth, lastAttendanceStatsAt } = useSync()
  const { active: demo, enter: enterDemo } = useDemo()
  // 「ストアで評価する」は production かつデモでない時だけ。通常の URL を開くだけで、評価依頼の API は呼ばない。
  const reviewUrl = showStoreReviewLink(RELEASE_STAGE, demo) ? storeReviewUrl(Platform.OS) : null
  const {
    timetableView,
    assignmentsView,
    examCountdownStart,
    setTimetableView,
    setAssignmentsView,
    setExamCountdownStart,
  } = useDisplaySettings()
  const [courses, setCourses] = useState<Course[]>([])
  const [settings, setSettings] = useState<AttendanceAlarmSettings>({})
  const [bulletinNotify, setBulletinNotify] = useState<BulletinNotifySettings>({ enabled: true, mode: 'all' })
  const [letusNewsNotify, setLetusNewsNotify] = useState<LetusNewsNotifySettings>({ enabled: true })
  const [changelogOpen, setChangelogOpen] = useState(false)
  // 出席送信の記録（真因未特定の間欠バグの証拠。開いた時だけ読み込む）。
  const [diags, setDiags] = useState<SubmitDiag[]>([])
  const [showDiags, setShowDiags] = useState(false)
  // 不具合報告の下書き（副導線。主導線は出席送信が失敗した時のエラー表示から直接）。
  const [reportOpen, setReportOpen] = useState(false)
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
  // 文言は**実装に合わせること**（ストアのデータセーフティ申告へ転記されるため、実装で裏の
  // 取れない主張を書くと虚偽記載になる）。現在の resetAll.ts は 予約通知 → Cookie → AsyncStorage
  // の順に消すので、ログイン状態の解除まで書いてよい。resetAll.ts を変えたらここも直す。
  function onResetAll() {
    Alert.alert(
      'すべてのデータをリセット',
      '時間割・課題・掲示・設定・保存済みデータをすべて消去し、LETUS・CLASSへのログイン状態も解除します。' +
        'この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '次へ', style: 'destructive', onPress: confirmResetAll },
      ],
    )
  }
  function confirmResetAll() {
    Alert.alert(
      '本当にリセットしますか？',
      '次のものがすべて消えます。\n' +
        '・時間割・課題・掲示・出席の記録\n' +
        '・通知の予約と各種設定\n' +
        '・規約への同意\n' +
        '・LETUS・CLASSへのログイン状態（Cookie）\n\n' +
        '消去後はアプリを終了します。次回起動時は、規約の同意とログインからやり直しになります。',
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
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]}>
        {/* 設定は初期状態ですべて閉じる（ユーザー指定 2026-07-22）。開いた状態が既定だと
            画面を開いた瞬間に長い並べ替えUIが占有し、下のカードが見えない。 */}
        <Accordion title="表示" icon="grid-outline">
          <SubSection first>
            <Text style={[styles.subHead, { color: ui.labelColor }]}>テーマ</Text>
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
          </SubSection>

          <SubSection>
            <Text style={[styles.subHead, { color: ui.labelColor }]}>時間割の表示</Text>
            <Segmented
              options={[
                { key: 'list', label: 'リスト' },
                { key: 'grid', label: 'グリッド' },
              ]}
              value={timetableView}
              onChange={setTimetableView}
            />
          </SubSection>

          <SubSection>
            <Text style={[styles.subHead, { color: ui.labelColor }]}>課題の並び</Text>
            <Segmented
              options={[
                { key: 'bucket', label: 'バケット別' },
                { key: 'flat', label: '締切順' },
              ]}
              value={assignmentsView}
              onChange={setAssignmentsView}
            />
          </SubSection>

          <SubSection>
            <Text style={[styles.subHead, { color: ui.labelColor }]}>試験カウントダウンの表示開始</Text>
            {/* Segmented は折り返さず等分するので、ラベルは「から」を省いて短くする（設計 A §6 Q9・§9-1）。
                キーは文字列なので 60 などは '60' に写して渡し、戻す時は toExamCountdownStart で検める。 */}
            <Segmented
              options={[
                { key: 'always', label: 'いつでも' },
                { key: '60', label: '60日前' },
                { key: '30', label: '30日前' },
                { key: '14', label: '14日前' },
                { key: '7', label: '7日前' },
              ]}
              value={String(examCountdownStart)}
              onChange={(k) => setExamCountdownStart(toExamCountdownStart(k === 'always' ? k : Number(k)))}
            />
            <Text style={[styles.note, { color: ui.labelColor }]}>
              ホームの試験カウントダウンに、試験の何日前から出すかを選べます。試験ごとの設定は各回の予定の編集で変えられます。試験の通知（前日20:00・当日8:00）は、この設定では変わりません。
            </Text>
          </SubSection>

          <SubSection>
            <View style={{ gap: SPACE.s2 }}>
              <LinkRow
                icon="swap-vertical-outline"
                title="ホームの並び"
                sub="表示するセクションと順序を変更"
                onPress={() => navigation.navigate('SectionOrder', { target: 'home' })}
              />
              <LinkRow
                icon="swap-vertical-outline"
                title="科目詳細の並び"
                sub="表示するセクションと順序を変更"
                onPress={() => navigation.navigate('SectionOrder', { target: 'subject' })}
              />
            </View>
          </SubSection>
        </Accordion>

        <Accordion title="通知" icon="notifications-outline">
          {/* OS側で通知が塞がれている間、以下のトグルは全部空振りする。
              アプリ内トグルだけを出していた頃は「設定はONなのに何も来ない」としか観測できなかった。 */}
          <NotificationPermissionNotice />
          <SubSection first>
            <Text style={[styles.subHead, { color: ui.labelColor }]}>新着掲示</Text>
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
          </SubSection>

          <SubSection>
            <Text style={[styles.subHead, { color: ui.labelColor }]}>LETUS更新</Text>
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
          </SubSection>

          <SubSection>
            <Text style={[styles.subHead, { color: ui.labelColor }]}>出席アラーム（科目別）</Text>
            <Text style={[styles.note, { color: ui.labelColor }]}>
              授業の開始時と終了前にお知らせします。リタスで出席済みと確認できた授業には送りません。OFFにした科目は、出席の受付が始まったときのお知らせも止まります。
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
          </SubSection>

          {/* 出欠状況の取得ぐあいを可視化する。収集ヘルスは保存していたのにUIに出ておらず、
              「授業時間外でも取れない」の原因（競合／ログイン切れ／構造変化）をユーザーも開発者も
              確認できなかった（2026-07-18）。ここで前回取得時刻と失敗理由を1行で示す。 */}
          <SubSection>
            <Text style={[styles.subHead, { color: ui.labelColor }]}>出欠状況の取得</Text>
            <View style={ui.card}>
              <Text style={[styles.rowLabel, { color: ui.valueColor }]}>
                {attendanceStatsDiagLine({
                  health: attendanceStatsHealth?.health ?? null,
                  lastSuccessAt: lastAttendanceStatsAt,
                  now: new Date(),
                })}
              </Text>
            </View>
          </SubSection>
        </Accordion>

        <Accordion title="データ" icon="server-outline">
          <View style={ui.card}>
            <Pressable style={styles.rowBetween} onPress={onClear}>
              <Text style={[styles.rowLabel, { color: ui.valueColor }]}>時間割データを消去</Text>
              <Text style={[styles.danger, { color: ui.colors.danger }]}>消去</Text>
            </Pressable>
            {/* デモ導線。ログイン画面にも置いているが、**セッションが生きているとログイン画面に
                到達しない**（Cookie は resetAll でも消えない）ため、ここが実質唯一の入口になる。
                審査員が既にログイン済みの状態から入る経路としても効く。 */}
            {demo ? null : (
              <Pressable
                style={[styles.rowBetween, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor }]}
                onPress={() => void enterDemo()}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.rowLabel, { color: ui.valueColor }]}>デモを表示する</Text>
                  <Text style={[styles.note, { color: ui.labelColor, marginTop: 4, marginLeft: 0 }]}>
                    サンプルデータで全機能を確認できます。実際のデータには影響しません。
                  </Text>
                </View>
                <Text style={[styles.rowAction, { color: ui.labelColor }]}>表示</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.rowBetween, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor }]}
              onPress={onResetHints}
            >
              <Text style={[styles.rowLabel, { color: ui.valueColor }]}>ヒントを再表示</Text>
              <Text style={[styles.rowAction, { color: ui.labelColor }]}>再表示</Text>
            </Pressable>
            <Pressable
              style={[styles.rowBetween, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor }]}
              onPress={onResetAll}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.rowLabel, { color: ui.valueColor }]}>すべてのデータをリセット</Text>
                <Text style={[styles.note, { color: ui.labelColor, marginTop: 4, marginLeft: 0 }]}>
                  時間割・課題・掲示・設定・保存済みデータをすべて消去し、ログイン状態も解除します。
                </Text>
              </View>
              <Text style={[styles.danger, { color: ui.colors.danger }]}>リセット</Text>
            </Pressable>
            {/* 出席送信の記録: 実機で間欠的に登録されない事象の真因が未特定のため、成功も失敗も
                自動で貯めて後から見返せるようにしている（その瞬間に気づけなくても証拠が残る）。
                認証コードそのものは記録しない。 */}
            <Pressable
              style={[styles.rowBetween, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.dividerColor }]}
              onPress={onToggleDiags}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.rowLabel, { color: ui.valueColor }]}>出席送信の記録</Text>
                <Text style={[styles.note, { color: ui.labelColor, marginTop: 4, marginLeft: 0 }]}>
                  直近{diags.length}件。うまく登録できなかった時は、この内容を開発者にお知らせください。
                </Text>
              </View>
              <Text style={[styles.rowAction, { color: ui.labelColor }]}>{showDiags ? '閉じる' : '表示'}</Text>
            </Pressable>
          </View>
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

        <View style={{ marginTop: 12 }}>
          <LinkRow
            icon="chatbubble-ellipses-outline"
            title="フィードバックを送る"
            sub="不具合の報告・ご要望"
            onPress={() => setReportOpen(true)}
          />
        </View>

        <Accordion title="アプリ情報" icon="information-circle-outline">
          <View style={ui.card}>
            <Text style={{ color: ui.valueColor, fontWeight: '500' }}>
              リタス {formatVersionLabel(Application.nativeApplicationVersion, Application.nativeBuildVersion, isPrerelease(RELEASE_STAGE))}
              {devBadgeSuffix(RELEASE_STAGE)}
            </Text>
            <Pressable onPress={() => Linking.openURL('https://litus.waiteu.dev/')}>
              <Text style={[styles.link, { color: ui.labelColor }]}>事前登録・お知らせ ↗</Text>
            </Pressable>
            {reviewUrl ? (
              <Pressable onPress={() => Linking.openURL(reviewUrl).catch(() => undefined)} accessibilityRole="link">
                <Text style={[styles.link, { color: ui.labelColor }]}>ストアで評価する ↗</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={[ui.card, { marginTop: 8 }]}>
            <Text style={[styles.changelogHeading, { color: ui.valueColor }]}>変更履歴</Text>
            {recentChangelog.map((entry) => (
              <View key={entry.build} style={styles.changelogEntry}>
                <Text style={[styles.changelogEntryTitle, { color: ui.labelColor }]}>
                  {formatChangelogHeading(entry)}
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

        <View style={{ marginTop: 12 }}>
          <LinkRow
            icon="document-text-outline"
            title="ライセンス"
            sub={FONT_LICENSE_TITLE}
            onPress={() => navigation.navigate('License')}
          />
        </View>
      </ScrollView>
      <ChangelogModal visible={changelogOpen} entries={CHANGELOG} onClose={() => setChangelogOpen(false)} />
      <FeedbackSheet visible={reportOpen} onClose={() => setReportOpen(false)} />
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  rowLabel: { fontSize: 14, flex: 1, paddingRight: 12 },
  danger: { fontSize: 14, fontWeight: '500' },
  // 行右端の中立アクション（dangerと同メトリクス・下線なし。linkは外部リンク専用）。
  rowAction: { fontSize: 14, fontWeight: '500' },
  link: { fontSize: 13, textDecorationLine: 'underline', marginTop: 8 },
  note: { fontSize: 12, marginTop: 8, marginLeft: 2 },
  diagLog: { fontSize: 10, lineHeight: 15 },
  fieldLabel: { fontSize: 13, marginLeft: 2, marginBottom: 2 },
  // 集約アコーディオン内の小見出し（表示=テーマ/時間割/課題/試験カウントダウン、
  // 通知=新着掲示/LETUS更新/出席アラーム/出欠状況の取得）。
  // 「ホームの並び」「科目詳細の並び」は subHead ではなく LinkRow（別画面 SectionOrder への導線）。
  subHead: { ...TYPE.label, letterSpacing: 0.3, marginLeft: 2, marginBottom: 6 },
  changelogHeading: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  changelogEntry: { marginBottom: 10 },
  changelogEntryTitle: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  changelogItem: { fontSize: 12, lineHeight: 17 },
  changelogMore: { fontSize: 13, fontWeight: '600', marginTop: 4 },
})
