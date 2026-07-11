import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRoute, type RouteProp } from '@react-navigation/native'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS } from '../theme'
import type { HomeStackParamList } from '../navigation/types'
import { loadBulletinDigest, loadBulletinDetailDiag } from '../storage/bulletinDigestStore'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import BulletinActionEngine from '../collect/BulletinActionEngine'

/**
 * 掲示詳細（本文）をネイティブ描画する。初回表示時に body キャッシュが無ければ裏で openDetail を実行し、
 * 本文取得＝CLASS側で既読化する。フラグはトグルで setFlag を実行しCLASSと同期。
 */
export default function BulletinDetailScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'BulletinDetail'>>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const [item, setItem] = useState<BulletinItem | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [detailDiag, setDetailDiag] = useState('')
  const [flagBusy, setFlagBusy] = useState(false)
  const startedRef = useRef(false)

  const reload = useCallback(async () => {
    const items = await loadBulletinDigest()
    setItem(items.find((i) => i.id === route.params.id) ?? null)
  }, [route.params.id])

  useEffect(() => {
    reload()
  }, [reload])

  // 初回、本文キャッシュが無ければ裏で取得（＝既読化）。1度だけ自動起動する。
  useEffect(() => {
    if (!item || startedRef.current) return
    if (!item.body) {
      startedRef.current = true
      setFetching(true)
    }
  }, [item])

  // 取得完了。本文が入っていなければ失敗扱いにして無限スピナーを避ける。
  const onFetched = useCallback(async () => {
    setFetching(false)
    const items = await loadBulletinDigest()
    const it = items.find((i) => i.id === route.params.id) ?? null
    setItem(it)
    if (it && !it.body) {
      setFetchFailed(true)
      loadBulletinDetailDiag().then(setDetailDiag).catch(() => undefined)
    }
  }, [route.params.id])

  const retryFetch = useCallback(() => {
    setFetchFailed(false)
    setFetching(true)
  }, [])

  const toggleFlag = useCallback(() => {
    // 本文取得中はCLASSセッションを専有しているため、フラグ操作を受け付けない（1セッション1アクション）。
    if (!item || flagBusy || fetching) return
    setFlagBusy(true)
  }, [item, flagBusy, fetching])

  const onFlagged = useCallback(() => {
    setFlagBusy(false)
    reload()
  }, [reload])

  if (!item) {
    return (
      <ScreenBg>
        <View style={styles.center}>
          <Text style={{ color: ui.valueColor }}>掲示が見つかりませんでした。</Text>
        </View>
      </ScreenBg>
    )
  }

  const b = item.body
  // v1移行データは date が空。id(`YYYY/MM/DD::件名`)から日付を復元してDOM行と突き合わせる。
  const targetDate = item.date || item.id.split('::')[0]
  return (
    <ScreenBg>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: clearance }]}>
        <View style={[ui.card, styles.panel]}>
          <View style={[styles.tag, { backgroundColor: ui.green ? 'rgba(255,255,255,0.5)' : '#d6efe4' }]}>
            <Text style={[styles.tagText, { color: ui.green ? '#04322a' : COLORS.emeraldDark }]}>{item.category}</Text>
          </View>
          <Text style={[styles.title, { color: ui.valueColor }]}>{item.title}</Text>

          <Pressable
            onPress={toggleFlag}
            disabled={flagBusy || fetching}
            style={[styles.flagBtn, { borderColor: item.flagged ? '#e0a100' : '#9bb3ab', opacity: fetching ? 0.5 : 1 }]}
          >
            <Ionicons name={item.flagged ? 'flag' : 'flag-outline'} size={16} color={item.flagged ? '#e0a100' : '#9bb3ab'} />
            <Text style={[styles.flagText, { color: item.flagged ? '#e0a100' : ui.labelColor }]}>
              {flagBusy ? '同期中…' : item.flagged ? 'フラグを外す' : 'フラグを付ける'}
            </Text>
          </Pressable>

          {b ? (
            <>
              {b.from ? <Text style={[styles.meta, { color: ui.labelColor }]}>差出人: {b.from}</Text> : null}
              {b.period ? <Text style={[styles.meta, { color: ui.labelColor }]}>掲示期間: {b.period}</Text> : null}
              <Text style={[styles.text, { color: ui.valueColor }]}>{b.text}</Text>
              {b.hasAttachment ? (
                <Text style={[styles.meta, { color: ui.labelColor, marginTop: 10 }]}>
                  ※ 添付ファイルはCLASSで確認してください。
                </Text>
              ) : null}
            </>
          ) : fetchFailed ? (
            <View style={styles.loading}>
              <Text style={{ color: ui.labelColor, fontSize: 13, textAlign: 'center' }}>
                本文を取得できませんでした。
              </Text>
              {detailDiag ? (
                <Text style={{ color: ui.labelColor, fontSize: 10, marginTop: 6, textAlign: 'center' }}>
                  診断: {detailDiag}
                </Text>
              ) : null}
              <Pressable onPress={retryFetch} style={styles.retryBtn}>
                <Ionicons name="refresh" size={15} color={COLORS.emerald} />
                <Text style={{ color: COLORS.emerald, fontWeight: '600', fontSize: 13 }}>再試行</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={COLORS.emerald} />
              <Text style={{ color: ui.labelColor, marginTop: 8, fontSize: 12 }}>本文を取得しています…</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {fetching ? (
        <BulletinActionEngine action="openDetail" title={item.title} date={targetDate} onFinished={onFetched} />
      ) : null}
      {flagBusy ? (
        <BulletinActionEngine
          action="setFlag"
          title={item.title}
          date={targetDate}
          desiredFlag={!item.flagged}
          onFinished={onFlagged}
        />
      ) : null}
    </ScreenBg>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  body: { padding: 14, paddingTop: 12 },
  panel: { gap: 4 },
  tag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', marginTop: 10, lineHeight: 25 },
  flagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  flagText: { fontSize: 13, fontWeight: '600' },
  loading: { alignItems: 'center', paddingVertical: 30 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  meta: { fontSize: 12, marginTop: 10 },
  text: { fontSize: 14, lineHeight: 22, marginTop: 12 },
})
