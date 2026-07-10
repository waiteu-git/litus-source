import { useCallback, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { ScreenBg, ScreenHeader, SectionLabel, useUi, useTabBarClearance } from '../ui/screen'
import { CAMPUSES, allCafeterias, type Cafeteria } from '../info/infoLinks'
import { loadFavorites, saveFavorites } from '../storage/favoritesStore'
import { toggleFavorite } from '../storage/favoritesSerialize'

/**
 * インフォ画面。学食（お気に入り＋キャンパス別）のハブ。CLASS掲示はホームへ移設したためここには持たない。
 */
export default function InfoScreen() {
  const ui = useUi()
  const clearance = useTabBarClearance()
  const [favorites, setFavorites] = useState<string[]>([])

  useFocusEffect(
    useCallback(() => {
      loadFavorites().then(setFavorites).catch(() => undefined)
    }, []),
  )

  async function onToggle(id: string) {
    const next = toggleFavorite(favorites, id)
    setFavorites(next)
    try {
      await saveFavorites(next)
    } catch {
      // 保存失敗は次回起動でロードし直し
    }
  }

  function openCafeteria(c: Cafeteria) {
    if (!c.url) return
    // 学食は決済フローがあるため、アプリ内WebViewではなく端末の既定ブラウザ（Chrome等）で開く。
    Linking.openURL(c.url).catch(() => undefined)
  }

  const favCafeterias = allCafeterias().filter((c) => favorites.includes(c.id) && c.url)

  const Row = ({ c }: { c: Cafeteria }) => {
    const on = favorites.includes(c.id)
    const disabled = !c.url
    return (
      <View style={[ui.card, styles.row]}>
        <Pressable style={styles.rowMain} onPress={() => openCafeteria(c)} disabled={disabled}>
          <Text style={[styles.rowName, { color: disabled ? '#9bb3ab' : ui.valueColor }]}>
            {c.name}
            {disabled ? '（準備中）' : ''}
          </Text>
          {!disabled ? <Ionicons name="open-outline" size={15} color="#9bb3ab" /> : null}
        </Pressable>
        {!disabled ? (
          <Pressable onPress={() => onToggle(c.id)} hitSlop={10}>
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
        {favCafeterias.length > 0 ? (
          <>
            <SectionLabel>お気に入り</SectionLabel>
            {favCafeterias.map((c) => (
              <Row key={`fav-${c.id}`} c={c} />
            ))}
          </>
        ) : null}

        <SectionLabel>学食</SectionLabel>
        {CAMPUSES.map((campus) => (
          <View key={campus.id} style={styles.campus}>
            <Text style={[styles.campusName, { color: ui.labelColor }]}>{campus.name}</Text>
            {campus.cafeterias.map((c) => (
              <Row key={c.id} c={c} />
            ))}
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
