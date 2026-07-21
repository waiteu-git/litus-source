import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../ui/Text'
import { PressableRow } from '../ui/Pressable'
import BulletinActionEngine from '../collect/BulletinActionEngine'
import ScreenHint from '../tutorial/ScreenHint'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { useDemo } from '../demo/DemoProvider'
import KillSwitchBanner from '../ui/KillSwitchBanner'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { loadCollectionHealth } from '../storage/collectionHealthStore'
import type { StoredHealth } from '../storage/collectionHealthSerialize'
import { loadBulletinRefreshedAt } from '../storage/refreshMetaStore'
import { clearDeliveredBulletinNotifications } from '../notifications/notifier'
import HealthBanner from '../ui/HealthBanner'
import FreshnessLabel from '../ui/FreshnessLabel'
import type { HomeStackParamList } from '../navigation/types'
import { COLORS } from '../theme'
import { isScheduleCategory } from '../timetableEvents/bulletinEvents'
import { Tag } from '../ui/Tag'

type Tab = 'unread' | 'flagged' | 'schedule'

/**
 * CLASS掲示のネイティブ一覧。上部で「未読 / フラグ付き」を切替え、行タップで詳細（本文）へ。
 * 既読化・フラグ同期は詳細画面側の headless アクションで行う。
 */
export default function BulletinListScreen() {
  const ui = useUi()
  const clearance = useTabBarClearance()
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>()
  const [items, setItems] = useState<BulletinItem[]>([])
  const [tab, setTab] = useState<Tab>('unread')
  const [health, setHealth] = useState<StoredHealth | null>(null)
  const [refreshedAt, setRefreshedAt] = useState(0)
  // 一覧の「既読にする」: 詳細を開かず openDetail アクションでCLASS側を既読化する。
  // ローカルのみの既読は次回同期で復活する（mergeBulletinItemsはincomingのunreadが権威）ため必ずCLASS側を通す。
  // 押した順のキューで先頭1件だけエンジンをマウントする。全件同時マウントだと ClassHeadlessCollector の
  // リース待ちガード（40秒）が全エンジンで同時に刻み始め、FIFO直列化で4〜5件目以降が自分の番の前に
  // タイムアウトして静かに空振りするため（連続タップ＝この機能の主用途で破綻する）。
  const [readQueue, setReadQueue] = useState<string[]>([])
  const markRead = (id: string) => setReadQueue((prev) => (prev.includes(id) ? prev : [...prev, id]))
  const onMarkedRead = useCallback(() => {
    setReadQueue((prev) => prev.slice(1))
    // ストアを権威に再読込。成功時は unread=false で未読タブから消え、失敗/CLASS帯時は未読のまま残る（正直な反映）。
    loadBulletinDigest().then(setItems).catch(() => undefined)
  }, [])

  const headId = readQueue[0] ?? null
  const { active: demo } = useDemo()
  const headItem = headId ? (items.find((i) => i.id === headId) ?? null) : null
  // キュー先頭がストアから消えていた場合（同期での整理等）はエンジンが起きないため、ここで次へ送る。
  useEffect(() => {
    if (headId && !headItem) setReadQueue((prev) => prev.slice(1))
  }, [headId, headItem])

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadBulletinDigest()
        .then((d) => active && setItems(d))
        .catch(() => undefined)
      loadCollectionHealth()
        .then((m) => active && setHealth(m.bulletin ?? null))
        .catch(() => undefined)
      loadBulletinRefreshedAt()
        .then((at) => active && setRefreshedAt(at))
        .catch(() => undefined)
      // 一覧を開いた＝新着通知の用は済んだので、配信済みの通知をトレイから消す。
      // 消さないと既読にしても通知が残り続ける（実機報告 2026-07-17）。
      // 画面のアンマウントではなく**フォーカス時**に消すのは、通知をタップして来た場合も
      // 一覧に着いた時点で用済みになるため。自タグ（bulletin-new）以外は触らない。
      clearDeliveredBulletinNotifications().catch(() => undefined)
      return () => {
        active = false
      }
    }, []),
  )

  const unread = items.filter((i) => i.unread)
  const flagged = items.filter((i) => i.flagged)
  // 授業タブ: 既読/未読を問わずスケジュール系（休講/補講/教室変更）。保持ルールで授業終了まで残る。
  const schedule = items.filter((i) => isScheduleCategory(i.category))
  const shown = tab === 'unread' ? unread : tab === 'flagged' ? flagged : schedule

  const TabBtn = ({ id, label, count }: { id: Tab; label: string; count: number }) => {
    const on = tab === id
    return (
      <Pressable
        onPress={() => setTab(id)}
        style={[styles.tabBtn, { backgroundColor: ui.softBoxBg }, on && { backgroundColor: COLORS.emerald }]}
      >
        <Text style={[styles.tabText, { color: on ? COLORS.white : ui.labelColor }]}>
          {label} {count}
        </Text>
      </Pressable>
    )
  }

  return (
    <ScreenBg>
      <KillSwitchBanner feature="bulletin" />
      <View style={styles.tabs}>
        <TabBtn id="unread" label="未読" count={unread.length} />
        <TabBtn id="flagged" label="フラグ付き" count={flagged.length} />
        <TabBtn id="schedule" label="授業" count={schedule.length} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: clearance }]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHint hintKey="bulletins" />
        <HealthBanner health={health?.health} source="class" />
        <FreshnessLabel at={refreshedAt} />
        {shown.length === 0 ? (
          <View style={[ui.card, { marginTop: 12 }]}>
            <Text style={{ color: ui.valueColor }}>
              {tab === 'unread'
                ? '未読の掲示はありません。ホームの「更新」で再取得できます。'
                : tab === 'flagged'
                  ? 'フラグを付けた掲示はありません。'
                  : '休講・補講・教室変更の掲示はありません。'}
            </Text>
          </View>
        ) : (
          shown.map((b) => (
            <PressableRow
              key={b.id}
              onPress={() => navigation.navigate('BulletinDetail', { id: b.id })}
              style={[ui.card, styles.item]}
            >
              <View style={styles.itemHead}>
                <View style={{ marginBottom: 6 }}>
                  <Tag label={b.category} size="sm" />
                </View>
                <View style={styles.headRight}>
                  {b.flagged ? <Text style={styles.flag}>🚩</Text> : null}
                  {b.unread ? (
                    readQueue.includes(b.id) ? (
                      <View style={styles.readBtn}>
                        <ActivityIndicator size="small" color={ui.accent} />
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => markRead(b.id)}
                        hitSlop={6}
                        style={[styles.readBtn, { backgroundColor: ui.softBoxBg }]}
                        accessibilityRole="button"
                        accessibilityLabel={`${b.title}を既読にする`}
                      >
                        <Ionicons name="checkmark" size={14} color={ui.accent} />
                        <Text style={[styles.readBtnText, { color: ui.accent }]}>既読にする</Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              </View>
              <Text style={[styles.title, { color: ui.valueColor }]}>{b.title}</Text>
              <Text style={[styles.meta, { color: ui.labelColor }]}>{b.meta}</Text>
            </PressableRow>
          ))
        )}
      </ScrollView>
      {/* デモ中はマウントしない（GuardedWebView が null を返し onFinished が来ないため、
          既読キューが先頭で詰まって進まなくなる）。 */}
      {headItem && !demo ? (
        <BulletinActionEngine
          key={headItem.id}
          action="openDetail"
          title={headItem.title}
          // v1移行データは date が空のことがあるため id（"日付::件名"）から補完（BulletinDetailScreenと同じ回避）。
          date={headItem.date || headItem.id.split('::')[0]}
          onFinished={onMarkedRead}
        />
      ) : null}
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  tabText: { fontSize: 13, fontWeight: '700' },
  list: { padding: 14, paddingTop: 12, paddingBottom: 24 },
  item: { marginBottom: 10 },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  readBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  readBtnText: { fontSize: 11, fontWeight: '700' },
  flag: { fontSize: 13 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  meta: { fontSize: 11, marginTop: 5 },
})
