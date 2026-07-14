import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { PressableRow } from '../ui/Pressable'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Chip, ScreenBg, ScreenHeader, useUi, useTabBarClearance } from '../ui/screen'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadCourseSnapshots } from '../storage/courseSnapshotStore'
import type { TimetableStackParamList } from '../navigation/types'
import { Badge } from '../ui/Badge'

type Row = { code: string; name: string; url: string; newCount: number }

/**
 * LETUSコース一覧（自前UI／Turn4で確定した4b）。既存のWebViewブラウズをやめ、収集済みの
 * コースを一覧化する。タップ先は現状LETUSの当該コースページ（WebView）— 一覧を自前化する
 * ことが今回のスコープで、コース内コンテンツの自前表示は別途パーサが要る（未着手）。
 */
export default function LetusCoursesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState('')

  useFocusEffect(
    useCallback(() => {
      let active = true
      ;(async () => {
        const map = await loadCourseMap()
        const snaps = await loadCourseSnapshots()
        const seen = new Set<string>()
        const list: Row[] = []
        for (const [code, course] of Object.entries(map)) {
          if (seen.has(course.url)) continue
          seen.add(course.url)
          const snap = snaps[course.url]
          list.push({ code, name: course.name, url: course.url, newCount: snap ? snap.added.length : 0 })
        }
        list.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
        if (active) setRows(list)
      })()
      return () => {
        active = false
      }
    }, []),
  )

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return rows
    return rows.filter((r) => r.name.includes(q))
  }, [rows, query])

  return (
    <ScreenBg>
      <ScreenHeader
        title="コース"
        icon="book-outline"
        right={<Chip label="更新" icon="refresh" onPress={() => navigation.navigate('CollectCourses')} />}
      />
      <View style={[ui.card, styles.search]}>
        <Ionicons name="search-outline" size={18} color={ui.labelColor} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="コースを検索"
          placeholderTextColor={ui.labelColor}
          style={[styles.searchInput, { color: ui.valueColor }]}
        />
      </View>
      {rows.length === 0 ? (
        <View style={[ui.card, { marginTop: 12 }]}>
          <Text style={{ color: ui.valueColor }}>まだコースがありません。右上の「更新」から収集してください。</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: clearance }]}>
          <View style={ui.card}>
            {filtered.map((r, i) => (
              <PressableRow
                key={r.url}
                style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: ui.dividerColor }]}
                onPress={() => navigation.navigate('Web', { url: r.url, title: r.name })}
              >
                <View style={[styles.icon, { backgroundColor: ui.softBoxBg }]}>
                  <Ionicons name="book-outline" size={18} color={ui.accent} />
                </View>
                <Text style={[styles.name, { color: ui.valueColor }]} numberOfLines={1}>
                  {r.name}
                </Text>
                {r.newCount > 0 ? <Badge variant="count" label="新着" count={r.newCount} /> : null}
                <Ionicons name="chevron-forward" size={18} color={ui.chevron} />
              </PressableRow>
            ))}
            {filtered.length === 0 ? <Text style={{ color: ui.labelColor, padding: 12 }}>該当するコースがありません</Text> : null}
          </View>
        </ScrollView>
      )}
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, marginTop: 4 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  list: { paddingTop: 12, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, fontWeight: '500' },
})
