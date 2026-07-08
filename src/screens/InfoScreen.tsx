import { useCallback, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { ScreenBg, ScreenHeader, SectionLabel, useUi } from '../ui/screen'
import { CAMPUSES, CLASS_BULLETIN_URL, allCafeterias, type Cafeteria } from '../info/infoLinks'
import { loadFavorites, saveFavorites } from '../storage/favoritesStore'
import { toggleFavorite } from '../storage/favoritesSerialize'
import { COLORS } from '../theme'

export default function InfoScreen() {
  const navigation = useNavigation<any>()
  const ui = useUi()
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

  function openBulletin() {
    navigation.navigate('Link', { url: CLASS_BULLETIN_URL, title: 'CLASS掲示', isClass: true })
  }

  const favCafeterias = allCafeterias().filter((c) => favorites.includes(c.id) && c.url)

  const Row = ({ c }: { c: Cafeteria }) => {
    const on = favorites.includes(c.id)
    const disabled = !c.url
    return (
      <View style={[ui.card, styles.row]}>
        <Pressable style={styles.rowMain} onPress={() => openCafeteria(c)} disabled={disabled}>
          <Text style={[styles.rowName, { color: disabled ? '#9bb3ab' : ui.valueColor }]}>
            {c.name}{disabled ? '（準備中）' : ''}
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionLabel>CLASS掲示</SectionLabel>
        <Pressable style={[ui.card, styles.bulletin]} onPress={openBulletin}>
          <Ionicons name="megaphone-outline" size={20} color={COLORS.emerald} />
          <Text style={[styles.bulletinText, { color: ui.valueColor }]}>掲示を開く（開くたび最新）</Text>
          <Ionicons name="chevron-forward" size={18} color="#9bb3ab" />
        </Pressable>

        {favCafeterias.length > 0 ? (
          <>
            <SectionLabel>お気に入り</SectionLabel>
            {favCafeterias.map((c) => <Row key={`fav-${c.id}`} c={c} />)}
          </>
        ) : null}

        <SectionLabel>学食</SectionLabel>
        {CAMPUSES.map((campus) => (
          <View key={campus.id} style={styles.campus}>
            <Text style={[styles.campusName, { color: ui.labelColor }]}>{campus.name}</Text>
            {campus.cafeterias.map((c) => <Row key={c.id} c={c} />)}
          </View>
        ))}
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 100 },
  bulletin: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletinText: { flex: 1, fontSize: 15, fontWeight: '500' },
  campus: { marginTop: 6 },
  campusName: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { fontSize: 15, fontWeight: '500' },
})
