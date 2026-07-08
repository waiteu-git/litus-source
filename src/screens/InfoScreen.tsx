import { useCallback, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Carousel, ScreenBg, ScreenHeader, SectionLabel, useUi } from '../ui/screen'
import { CAMPUSES, CLASS_BULLETIN_URL, allCafeterias, type Cafeteria } from '../info/infoLinks'
import { loadFavorites, saveFavorites } from '../storage/favoritesStore'
import { toggleFavorite } from '../storage/favoritesSerialize'
import { loadBulletinDigest } from '../storage/bulletinDigestStore'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { COLORS } from '../theme'

export default function InfoScreen() {
  const navigation = useNavigation<any>()
  const ui = useUi()
  const [favorites, setFavorites] = useState<string[]>([])
  const [bulletin, setBulletin] = useState<BulletinItem[]>([])

  useFocusEffect(
    useCallback(() => {
      loadFavorites().then(setFavorites).catch(() => undefined)
      // 未読ダイジェストが埋まっていればスライド表示、空なら単一CTAにフォールバックする。
      loadBulletinDigest().then(setBulletin).catch(() => undefined)
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* モジュール1: CLASS掲示。今後この位置に他モジュール（学食詳細・学年暦など）を同じ
            SectionLabel + card の形で積み増していける（Turn2/3で確定した拡張性重視の構成）。 */}
        <SectionLabel>CLASS掲示</SectionLabel>
        {bulletin.length > 0 ? (
          <View style={[ui.card, styles.bulletinCard]}>
            <View style={styles.bulletinHead}>
              <Ionicons name="megaphone-outline" size={18} color={ui.green ? '#ffffff' : COLORS.emerald} />
              <Text style={[styles.bulletinHeadText, { color: ui.valueColor }]}>CLASS掲示</Text>
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>未読 {bulletin.length}</Text>
              </View>
            </View>
            <Carousel
              intervalMs={3500}
              items={bulletin.map((b) => (
                <Pressable key={b.id} onPress={openBulletin} style={styles.bulletinSlide}>
                  <View style={[styles.bulletinTag, { backgroundColor: ui.green ? 'rgba(255,255,255,0.5)' : '#d6efe4' }]}>
                    <Text style={[styles.bulletinTagText, { color: ui.green ? '#04322a' : COLORS.emeraldDark }]}>
                      {b.category}
                    </Text>
                  </View>
                  <Text style={[styles.bulletinTitle, { color: ui.valueColor }]} numberOfLines={2}>
                    {b.title}
                  </Text>
                  <Text style={[styles.bulletinMeta, { color: ui.labelColor }]}>{b.meta}</Text>
                </Pressable>
              ))}
            />
            <Pressable onPress={openBulletin}>
              <Text style={[styles.bulletinMore, { color: ui.green ? '#eafff7' : COLORS.emerald }]}>すべて見る ↗</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={[ui.card, styles.bulletinCta]} onPress={openBulletin}>
            <Ionicons name="megaphone-outline" size={20} color={COLORS.emerald} />
            <Text style={[styles.bulletinCtaText, { color: ui.valueColor }]}>掲示を開く（開くたび最新）</Text>
            <Ionicons name="chevron-forward" size={18} color="#9bb3ab" />
          </Pressable>
        )}

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
  bulletinCard: { paddingBottom: 12 },
  bulletinHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bulletinHeadText: { fontSize: 15, fontWeight: '600', flex: 1 },
  unreadBadge: { backgroundColor: COLORS.cta, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  unreadBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  bulletinSlide: { minHeight: 76 },
  bulletinTag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  bulletinTagText: { fontSize: 10, fontWeight: '700' },
  bulletinTitle: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  bulletinMeta: { fontSize: 11, marginTop: 5 },
  bulletinMore: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  bulletinCta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletinCtaText: { flex: 1, fontSize: 15, fontWeight: '500' },
  campus: { marginTop: 6 },
  campusName: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { fontSize: 15, fontWeight: '500' },
})
