import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View, ActivityIndicator, Pressable, Alert } from 'react-native'
import { Text } from '../ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenBg, useUi, useTabBarClearance } from '../ui/screen'
import { RADIUS } from '../ui/scale'
import { COLORS } from '../theme'
import type { HomeStackParamList } from '../navigation/types'
import { loadBulletinDigest, loadBulletinDetailDiag, updateBulletinItem } from '../storage/bulletinDigestStore'
import { useDemo } from '../demo/DemoProvider'
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
  // 読書面（不透明サーフェス）上の操作アクセント。ui.accent は翠テーマで白＝白地に沈むため使わない。
  // 明地では emeraldDark（白地6.9:1でAA可）、暗地では emeraldLight。
  const readAccent = ui.pick(COLORS.emeraldDark, COLORS.emeraldDark, COLORS.emeraldLight)
  const [item, setItem] = useState<BulletinItem | null>(null)
  const [fetching, setFetching] = useState(false)
  const { active: demo } = useDemo()
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
    // デモ中は起動しない。GuardedWebView が null を返すため onFinished が永久に来ず、
    // 取得中フラグが立ちっぱなしになる（フラグ操作もその間ブロックされる）。
    // デモ掲示は body をシード済みなので取得の必要もない。
    if (demo) return
    if (!item.body || item.unread) {
      startedRef.current = true
      setFetching(true)
    }
  }, [item, demo])

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
        {/* 読書面: 本文カードを不透明サーフェスへ昇格（ガラスに沈ませない・面の3階級②）。 */}
        <View style={[styles.card, { backgroundColor: ui.colors.readingSurface, borderColor: ui.colors.readingBorder }]}>
          <View style={styles.tagRow}>
            {item.important ? (
              <View style={[styles.important, { backgroundColor: ui.colors.dangerBg }]}>
                <Ionicons name="flag" size={12} color={ui.colors.danger} />
                <Text style={[styles.importantText, { color: ui.colors.danger }]}>重要</Text>
              </View>
            ) : null}
            {item.category ? (
              <View style={[styles.catPill, { backgroundColor: ui.colors.readingBorder }]}>
                <Text style={[styles.catPillText, { color: ui.colors.readingHeading }]}>{item.category}</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={toggleFlag} disabled={flagBusy || fetching} hitSlop={8} style={{ opacity: fetching ? 0.4 : 1 }}>
              {flagBusy ? (
                <ActivityIndicator size="small" color={readAccent} />
              ) : (
                <Ionicons
                  name={item.flagged ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={item.flagged ? readAccent : ui.colors.readingMuted}
                />
              )}
            </Pressable>
          </View>

          <Text style={[styles.title, { color: ui.colors.readingHeading }]}>{item.title}</Text>

          {b?.from || item.date || b?.period ? (
            <View style={styles.meta}>
              {b?.from ? (
                <View style={styles.metaRow}>
                  <Ionicons name="person-outline" size={12} color={ui.colors.readingMuted} />
                  <Text style={[styles.metaText, { color: ui.colors.readingMuted }]} numberOfLines={2}>{b.from}</Text>
                </View>
              ) : null}
              {item.date || b?.period ? (
                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={12} color={ui.colors.readingMuted} />
                  <Text style={[styles.metaText, { color: ui.colors.readingMuted }]} numberOfLines={2}>
                    {[item.date ? `掲載日 ${item.date}` : '', b?.period ? `掲示期間 ${b.period}` : ''].filter(Boolean).join(' ・ ')}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.hr, { backgroundColor: ui.colors.readingBorder }]} />

          {b ? (
            <>
              <Text style={[styles.text, { color: ui.colors.readingInk }]}>{b.text}</Text>
              {b.hasAttachment ? (
                <Text style={[styles.attachNote, { color: ui.colors.readingMuted }]}>
                  ※ 添付ファイルは下の「元ページで開く」から確認・ダウンロードできます。
                </Text>
              ) : null}
              <View style={[styles.hr, { backgroundColor: ui.colors.readingBorder }]} />
              <View style={styles.readNote}>
                <Ionicons name="checkmark" size={12} color={ui.colors.readingMuted} />
                <Text style={[styles.readNoteText, { color: ui.colors.readingMuted }]}>
                  この掲示は開いた時点でCLASSに既読が送信されます（演出なし）
                </Text>
              </View>
            </>
          ) : fetchFailed ? (
            <View style={styles.loading}>
              <Text style={{ color: ui.colors.readingMuted, fontSize: 13, textAlign: 'center' }}>本文を取得できませんでした。</Text>
              {__DEV__ && detailDiag ? (
                <Text style={{ color: ui.colors.readingMuted, fontSize: 10, marginTop: 6, textAlign: 'center' }}>診断: {detailDiag}</Text>
              ) : null}
              <View style={styles.failRow}>
                <Pressable onPress={retryFetch} style={styles.retryBtn}>
                  <Ionicons name="refresh" size={15} color={readAccent} />
                  <Text style={{ color: readAccent, fontWeight: '600', fontSize: 13 }}>再試行</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={readAccent} />
              <Text style={{ color: ui.colors.readingMuted, marginTop: 8, fontSize: 12 }}>本文を取得しています…</Text>
            </View>
          )}
        </View>

        {/* 副ボタン: 元ページで開く（添付DL/原本確認はCLASS本物ページで完結）。全幅・読書面の下。 */}
        <Pressable
          onPress={openInClass}
          style={[styles.btnSecondary, { backgroundColor: ui.colors.readingSurface, borderColor: ui.colors.readingBorder }]}
        >
          <Ionicons name="open-outline" size={15} color={readAccent} />
          <Text style={[styles.btnSecondaryText, { color: readAccent }]}>元ページで開く</Text>
        </Pressable>
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
  body: { paddingTop: 12, paddingBottom: 24 },
  card: { borderWidth: 1, borderRadius: RADIUS.card, padding: 16 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  important: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 },
  importantText: { fontSize: 12, fontWeight: '700' },
  catPill: { borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 },
  catPillText: { fontSize: 12, fontWeight: '500' },
  title: { fontSize: 21, lineHeight: 29, fontWeight: '700', marginTop: 12 },
  meta: { marginTop: 12, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 11, lineHeight: 15, flex: 1 },
  hr: { height: 1, marginVertical: 16 },
  text: { fontSize: 16, lineHeight: 26 },
  attachNote: { fontSize: 11, lineHeight: 16, marginTop: 12 },
  readNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readNoteText: { fontSize: 11, lineHeight: 15, flex: 1 },
  loading: { alignItems: 'center', paddingVertical: 30 },
  failRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: 12, marginTop: 16 },
  btnSecondaryText: { fontSize: 14, fontWeight: '500' },
})
