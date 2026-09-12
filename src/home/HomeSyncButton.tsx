import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { useUi } from '../ui/screen'
import { useSync } from '../sync/SyncProvider'
import { useClassSyncConfirm } from '../sync/useClassSyncConfirm'
import { syncChipA11yLabel, syncHeaderView, type SyncBarInput } from './syncBarLabel'
import { PressableRow } from '../ui/Pressable'

/**
 * ヘッダー右（歯車の左）の同期チップ。タップで掲示→課題の順次同期（runFullSync）。
 * 状況は短縮形（「◯分前」/「同期中」/スキップ極短形/「要再同期」）でヘッダー幅に収める
 * （詳細なスキップ理由は課題/時間割タブの syncSkipMessage が担う）。掲示同期中はスピナー、
 * それ以外はアイコン。busy 中は押下演出ごと止める（disabled）。
 * 読み上げ名は状態を含む長い文言（syncChipA11yLabel＝画面の短縮形を必ず含む・E0 A8）。
 * 押せる範囲（E0 H1）: 外枠（PressableRow）は透明で、上下7ずつの padding と同じ量の負の margin を持つ＝押せる高さ44・
 * ヘッダー行へ差し出す高さは30のまま（見た目も行の高さも変わらない）。hitSlop で広げない（ヘッダー行が平坦化されて
 * いるかどうかで黙って効き方が変わる＝設計の禁止事項2・F10・F13）。押下の拡大縮小は外枠にかかるが、中心が同じなので
 * 見え方は同じ。ピルの背景・角丸・最小高・最大幅は内側の View が持つ。
 */
export default function HomeSyncButton() {
  const ui = useUi()
  const sync = useSync()
  const requestFullSync = useClassSyncConfirm()
  // 「◯分前」の追随用に分単位で再評価（ホーム本体の tick とは独立・チップだけ再レンダー）。
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const input: SyncBarInput = {
    bulletinBusy: sync.bulletinBusy,
    assignmentBusy: sync.assignmentBusy,
    skip: sync.skip,
    bulletinHealth: sync.bulletinHealth,
    letusHealth: sync.letusHealth,
    lastSyncAt: sync.lastSyncAt,
  }
  const view = syncHeaderView(input, now)
  const busy = sync.bulletinBusy || sync.assignmentBusy
  const warn = view.kind === 'warn'
  const textColor = warn ? ui.colors.warn : ui.pillText

  return (
    <PressableRow
      style={styles.hit}
      onPress={requestFullSync}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={syncChipA11yLabel(input, now)}
    >
      <View style={[styles.chip, { backgroundColor: warn ? ui.colors.warnBg : ui.pillBg }]}>
        {view.kind === 'busySpinner' ? (
          <ActivityIndicator size="small" color={ui.accent} />
        ) : (
          <Ionicons
            name={warn ? 'alert-circle-outline' : view.kind === 'skip' ? 'information-circle-outline' : 'refresh'}
            size={15}
            color={warn ? ui.colors.warn : ui.accent}
          />
        )}
        <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
          {view.text}
        </Text>
      </View>
    </PressableRow>
  )
}

const styles = StyleSheet.create({
  // 押せる範囲だけを上下7ずつ広げる透明な外枠（行へ差し出す高さは 30＋14−14＝30）。
  hit: { paddingVertical: 7, marginVertical: -7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    // アイコン(15)とスピナー(small≒20)で高さが跳ねないよう最小高を固定する。
    minHeight: 30,
    paddingVertical: 4,
    maxWidth: 150,
  },
  text: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
})
