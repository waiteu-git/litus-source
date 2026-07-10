import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { COLORS } from '../theme'

/**
 * CLASS掲示のネイティブ一覧（収集済みダイジェストを表示）。CLASSの生画面は開かない＝ログイン画面が
 * 出る問題を根絶。本文の個別表示は次段（本文収集 or 駆動ビューア）で対応する。
 */
export default function BulletinListScreen() {
  const ui = useUi()
  const clearance = useTabBarClearance()
  const [items, setItems] = useState<BulletinItem[]>([])

  useFocusEffect(
    useCallback(() => {
      let active = true
      loadBulletinDigest()
        .then((d) => {
          if (active) setItems(d)
        })
        .catch(() => undefined)
      return () => {
        active = false
      }
    }, []),
  )

  return (
    <ScreenBg>
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={[ui.card, { marginTop: 12 }]}>
            <Text style={{ color: ui.valueColor }}>
              表示できる掲示がありません。インフォの「更新」で取得してください。
            </Text>
          </View>
        ) : (
          items.map((b) => (
            <View key={b.id} style={[ui.card, styles.item]}>
              <View style={[styles.tag, { backgroundColor: ui.green ? 'rgba(255,255,255,0.5)' : '#d6efe4' }]}>
                <Text style={[styles.tagText, { color: ui.green ? '#04322a' : COLORS.emeraldDark }]}>{b.category}</Text>
              </View>
              <Text style={[styles.title, { color: ui.valueColor }]}>{b.title}</Text>
              <Text style={[styles.meta, { color: ui.labelColor }]}>{b.meta}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: 12, paddingBottom: 24 },
  item: { marginBottom: 10 },
  tag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  tagText: { fontSize: 10, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  meta: { fontSize: 11, marginTop: 5 },
})
