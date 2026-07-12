import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View, ActivityIndicator, Pressable, Alert } from 'react-native'
import { Text } from '../ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { COLORS } from '../theme'
import type { HomeStackParamList } from '../navigation/types'
import { loadBulletinDigest, loadBulletinDetailDiag, updateBulletinItem } from '../storage/bulletinDigestStore'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import BulletinActionEngine from '../collect/BulletinActionEngine'
import { evaluateAccess } from '../health/accessGate'
import { useConnectivity } from '../health/connectivity'

/**
 * 掲示詳細（本文）をネイティブ描画する。初回表示時に body キャッシュが無ければ裏で openDetail を実行し、
 * 本文取得＝CLASS側で既読化する。フラグはトグルで setFlag を実行しCLASSと同期。
 */
export default function BulletinDetailScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'BulletinDetail'>>()
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>()
  const ui = useUi()
  const clearance = useTabBarClearance()
  const [item, setItem] = useState<BulletinItem | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [detailDiag, setDetailDiag] = useState('')
  const [flagBusy, setFlagBusy] = useState(false)
  const startedRef = useRef(false)
  const isOnline = useConnectivity()

  // 「CLASSで開く」は可視WebViewビューアへの遷移なのでブロックしない。帯内/オフライン時のみ
  // 確認ダイアログを挟み、続行はユーザーの選択に委ねる。
  const openInClass = () => {
    const decision = evaluateAccess('class', { now: new Date(), isOnline })
    const go = () => navigation.navigate('BulletinWeb', { id: route.params.id })
    if (decision.allowed) return go()
    const why = decision.reason === 'offline' ? 'オフライン' : 'CLASSメンテナンス中（毎日2:00–4:00）'
    Alert.alert(
      'CLASSで開きますか？',
      `${why}のため、エラーになる可能性があります。開きますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '開く', onPress: go },
      ],
    )
  }

  const reload = useCallback(async () => {
    const items = await loadBulletinDigest()
    setItem(items.find((i) => i.id === route.params.id) ?? null)
  }, [route.params.id])

  useEffect(() => {
    reload()
  }, [reload])

  // 初回、本文キャッシュが無い、または未読のあいだは裏で openDetail を実行する。
  // openDetail はCLASSのモーダルを開く＝二重postbackでCLASS側の既読化を伴うため、
  // 本文がキャッシュ済みでも未読なら実行しないとCLASS側が未読のまま残り、次の収集で
  // リストに戻ってしまう（重要掲示はCarouselで本文が先にキャッシュされやすく、旧「!item.body」
  // 条件だと既読化がスキップされていた）。1度だけ自動起動する。
  useEffect(() => {
    if (!item || startedRef.current) return
    if (!item.body || item.unread) {
      startedRef.current = true
      setFetching(true)
    }
  }, [item])

  // 取得完了。本文が入っていなければ失敗扱いにして無限スピナーを避ける。
  // 本文が取れた＝CLASS側で既読化済みなので、ローカルも既読に落として再実行と再流入を防ぐ。
  const onFetched = useCallback(async () => {
    setFetching(false)
    const items = await loadBulletinDigest()
    const it = items.find((i) => i.id === route.params.id) ?? null
    if (it && it.body) {
      if (it.unread) {
        await updateBulletinItem(it.id, (i) => ({ ...i, unread: false }))
        setItem({ ...it, unread: false })
      } else {
        setItem(it)
      }
    } else {
      setItem(it)
      setFetchFailed(true)
      if (__DEV__) loadBulletinDetailDiag().then(setDetailDiag).catch(() => undefined)
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
          <View style={[styles.tag, { backgroundColor: ui.pillBg }]}>
            <Text style={[styles.tagText, { color: ui.pillText }]}>{item.category}</Text>
          </View>
          <Text style={[styles.title, { color: ui.valueColor }]}>{item.title}</Text>

          <View style={styles.actionsRow}>
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
            {/* 添付ファイルの確認・DLはCLASS本物ページ側で完結させる。全掲示に常設。 */}
            <Pressable
              onPress={openInClass}
              style={[styles.flagBtn, { borderColor: ui.accent }]}
            >
              <Ionicons name="open-outline" size={16} color={ui.accent} />
              <Text style={[styles.flagText, { color: ui.accent }]}>CLASSで開く</Text>
            </Pressable>
          </View>

          {b ? (
            <>
              {b.from ? <Text style={[styles.meta, { color: ui.labelColor }]}>差出人: {b.from}</Text> : null}
              {b.period ? <Text style={[styles.meta, { color: ui.labelColor }]}>掲示期間: {b.period}</Text> : null}
              <Text style={[styles.text, { color: ui.valueColor }]}>{b.text}</Text>
              {b.hasAttachment ? (
                <Text style={[styles.meta, { color: ui.labelColor, marginTop: 10 }]}>
                  ※ 添付ファイルは上の「CLASSで開く」から確認・ダウンロードしてください。
                </Text>
              ) : null}
            </>
          ) : fetchFailed ? (
            <View style={styles.loading}>
              <Text style={{ color: ui.labelColor, fontSize: 13, textAlign: 'center' }}>
                本文を取得できませんでした。
              </Text>
              {__DEV__ && detailDiag ? (
                <Text style={{ color: ui.labelColor, fontSize: 10, marginTop: 6, textAlign: 'center' }}>
                  診断: {detailDiag}
                </Text>
              ) : null}
              <View style={styles.failRow}>
                <Pressable onPress={retryFetch} style={styles.retryBtn}>
                  <Ionicons name="refresh" size={15} color={ui.accent} />
                  <Text style={{ color: ui.accent, fontWeight: '600', fontSize: 13 }}>再試行</Text>
                </Pressable>
                {/* 本文取得が不調でも、上部の常設「CLASSで開く」で本物ページを開ける。 */}
              </View>
            </View>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={ui.accent} />
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
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  flagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  flagText: { fontSize: 13, fontWeight: '600' },
  loading: { alignItems: 'center', paddingVertical: 30 },
  failRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 12, marginTop: 10 },
  text: { fontSize: 14, lineHeight: 22, marginTop: 12 },
})
