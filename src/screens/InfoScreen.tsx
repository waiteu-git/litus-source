import { useCallback, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { ScreenBg, ScreenHeader, SectionLabel, Segmented, useUi, useTabBarClearance } from '../ui/screen'
import {
  CAMPUS_DEFS,
  CATEGORY_DEFS,
  allItems,
  itemsFor,
  type CampusId,
  type InfoItem,
} from '../info/infoLinks'
import { loadInfoCampus, saveInfoCampus } from '../storage/infoCampusStore'
import { loadFavorites, saveFavorites } from '../storage/favoritesStore'
import { toggleFavorite } from '../storage/favoritesSerialize'

type SegKey = 'all' | CampusId

/**
 * インフォ画面。キャンパス×サービス種別（学食/図書館/最寄り駅時刻表）のリンクハブ。
 * 全リンクは端末既定ブラウザで開く（通信先制約によりアプリ内WebView不可）。
 */
export default function InfoScreen() {
  const ui = useUi()
  const clearance = useTabBarClearance()
  const [favorites, setFavorites] = useState<string[]>([])
  const [seg, setSeg] = useState<SegKey>('all')

  useFocusEffect(
    useCallback(() => {
      loadFavorites().then(setFavorites).catch(() => undefined)
      loadInfoCampus()
        .then((c) => setSeg(c ?? 'all'))
        .catch(() => undefined)
    }, []),
  )

  function onSelectSeg(key: SegKey) {
    setSeg(key)
    saveInfoCampus(key === 'all' ? null : key).catch(() => undefined)
  }

  async function onToggle(id: string) {
    const next = toggleFavorite(favorites, id)
    setFavorites(next)
    try {
      await saveFavorites(next)
    } catch {
      // 保存失敗は次回起動でロードし直し
    }
  }

  function openItem(i: InfoItem) {
    if (!i.url) return
    // 決済/外部サイトのため端末既定ブラウザで開く。
    Linking.openURL(i.url).catch(() => undefined)
  }

  const favItems = allItems().filter((i) => favorites.includes(i.id) && i.url)
  const visibleCampuses = seg === 'all' ? CAMPUS_DEFS : CAMPUS_DEFS.filter((c) => c.id === seg)

  const Row = ({ i }: { i: InfoItem }) => {
    const on = favorites.includes(i.id)
    const disabled = !i.url
    return (
      <View style={[ui.card, styles.row]}>
        <Pressable style={styles.rowMain} onPress={() => openItem(i)} disabled={disabled}>
          <Text style={[styles.rowName, { color: disabled ? '#9bb3ab' : ui.valueColor }]}>
            {i.name}
            {disabled ? '（準備中）' : ''}
          </Text>
          {!disabled ? <Ionicons name="open-outline" size={15} color="#9bb3ab" /> : null}
        </Pressable>
        {!disabled ? (
          <Pressable onPress={() => onToggle(i.id)} hitSlop={10}>
            <Ionicons name={on ? 'star' : 'star-outline'} size={22} color={on ? '#f5a623' : '#9bb3ab'} />
          </Pressable>
        ) : null}
      </View>
    )
  }

  return (
    <ScreenBg>
      <ScreenHeader title="インフォ" icon="newspaper-outline" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: clearance }]}>
        <Segmented<SegKey>
          options={[
            { key: 'all', label: 'すべて' },
            ...CAMPUS_DEFS.map((c) => ({ key: c.id, label: c.name.replace('キャンパス', '') })),
          ]}
          value={seg}
          onChange={onSelectSeg}
        />

        {favItems.length > 0 ? (
          <>
            <SectionLabel>お気に入り</SectionLabel>
            {favItems.map((i) => (
              <Row key={`fav-${i.id}`} i={i} />
            ))}
          </>
        ) : null}

        {visibleCampuses.map((campus) => (
          <View key={campus.id} style={styles.campus}>
            {seg === 'all' ? (
              <Text style={[styles.campusName, { color: ui.labelColor }]}>{campus.name}</Text>
            ) : null}
            {CATEGORY_DEFS.map((cat) => {
              const items = itemsFor(campus.id, cat.id)
              if (items.length === 0) return null
              return (
                <View key={`${campus.id}-${cat.id}`}>
                  <SectionLabel>{cat.label}</SectionLabel>
                  {items.map((i) => (
                    <Row key={i.id} i={i} />
                  ))}
                </View>
              )
            })}
          </View>
        ))}
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 100 },
  campus: { marginTop: 6 },
  campusName: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { fontSize: 15, fontWeight: '500' },
})
