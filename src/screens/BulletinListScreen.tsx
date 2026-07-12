import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import KillSwitchBanner from '../ui/KillSwitchBanner'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import type { HomeStackParamList } from '../navigation/types'
import { COLORS } from '../theme'

type Tab = 'unread' | 'flagged'

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

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadBulletinDigest()
        .then((d) => active && setItems(d))
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, []),
  )

  const unread = items.filter((i) => i.unread)
  const flagged = items.filter((i) => i.flagged)
  const shown = tab === 'unread' ? unread : flagged

  const TabBtn = ({ id, label, count }: { id: Tab; label: string; count: number }) => {
    const on = tab === id
    return (
      <Pressable onPress={() => setTab(id)} style={[styles.tabBtn, on && { backgroundColor: COLORS.emerald }]}>
        <Text style={[styles.tabText, { color: on ? '#fff' : ui.labelColor }]}>
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
      </View>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: clearance }]}
        showsVerticalScrollIndicator={false}
      >
        {shown.length === 0 ? (
          <View style={[ui.card, { marginTop: 12 }]}>
            <Text style={{ color: ui.valueColor }}>
              {tab === 'unread'
                ? '未読の掲示はありません。インフォの「更新」で取得してください。'
                : 'フラグを付けた掲示はありません。'}
            </Text>
          </View>
        ) : (
          shown.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => navigation.navigate('BulletinDetail', { id: b.id })}
              style={[ui.card, styles.item]}
            >
              <View style={styles.itemHead}>
                <View style={[styles.tag, { backgroundColor: ui.green ? 'rgba(255,255,255,0.5)' : '#d6efe4' }]}>
                  <Text style={[styles.tagText, { color: ui.green ? '#04322a' : COLORS.emeraldDark }]}>{b.category}</Text>
                </View>
                {b.flagged ? <Text style={styles.flag}>🚩</Text> : null}
              </View>
              <Text style={[styles.title, { color: ui.valueColor }]}>{b.title}</Text>
              <Text style={[styles.meta, { color: ui.labelColor }]}>{b.meta}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.05)' },
  tabText: { fontSize: 13, fontWeight: '700' },
  list: { padding: 14, paddingTop: 12, paddingBottom: 24 },
  item: { marginBottom: 10 },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  tagText: { fontSize: 10, fontWeight: '700' },
  flag: { fontSize: 13 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  meta: { fontSize: 11, marginTop: 5 },
})
