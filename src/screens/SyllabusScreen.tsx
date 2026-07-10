import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { parseSyllabus, type ParsedSyllabus } from '../parsers/syllabus'
import type { TimetableStackParamList } from '../navigation/types'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS } from '../theme'

type Status = 'loading' | 'ok' | 'error'

/**
 * シラバスを翠ネイティブUIで表示（静的HTMLをfetch→parseSyllabus）。スマホで見づらい原本HTMLの
 * 代わりに、ラベル/値を読みやすいカードで縦に並べる。読み込み失敗時は原本をアプリ内WebViewで開ける。
 */
export default function SyllabusScreen() {
  const route = useRoute<RouteProp<TimetableStackParamList, 'Syllabus'>>()
  const navigation = useNavigation<NativeStackNavigationProp<TimetableStackParamList>>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const { url } = route.params
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<ParsedSyllabus | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(url)
        const html = await res.text()
        const parsed = parseSyllabus(html)
        if (!active) return
        if (parsed.rows.length === 0) {
          setStatus('error')
          return
        }
        setData(parsed)
        setStatus('ok')
      } catch {
        if (active) setStatus('error')
      }
    })()
    return () => {
      active = false
    }
  }, [url])

  if (status === 'loading') {
    return (
      <ScreenBg>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.emerald} />
          <Text style={[styles.muted, { color: ui.labelColor }]}>シラバスを読み込んでいます…</Text>
        </View>
      </ScreenBg>
    )
  }

  if (status === 'error' || !data) {
    return (
      <ScreenBg>
        <View style={styles.center}>
          <Text style={[styles.muted, { color: ui.valueColor }]}>シラバスを表示できませんでした。</Text>
          <Pressable
            style={styles.linkBtn}
            onPress={() => navigation.replace('Web', { url, title: 'シラバス' })}
          >
            <Text style={styles.linkBtnText}>原本を開く</Text>
          </Pressable>
        </View>
      </ScreenBg>
    )
  }

  return (
    <ScreenBg>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: clearance }]}>
        <Text style={[styles.title, { color: ui.valueColor }]}>{data.title}</Text>
        {data.rows.map((row, i) =>
          row.value ? (
            <View key={`${row.label}-${i}`} style={[ui.card, styles.card]}>
              <Text style={[styles.label, { color: ui.labelColor }]}>{row.label}</Text>
              <Text style={[styles.value, { color: ui.valueColor }]}>{row.value}</Text>
            </View>
          ) : (
            <Text key={`${row.label}-${i}`} style={[styles.section, { color: ui.labelColor }]}>
              {row.label}
            </Text>
          ),
        )}
      </ScrollView>
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  muted: { fontSize: 14 },
  body: { paddingVertical: 12, paddingBottom: 28 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  card: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  value: { fontSize: 14, lineHeight: 21 },
  section: { fontSize: 15, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  linkBtn: { backgroundColor: COLORS.cta, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  linkBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
})
