import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../ui/Text'
import { useUi } from '../ui/screen'
import { useSync } from '../sync/SyncProvider'
import { useClassSyncConfirm } from '../sync/useClassSyncConfirm'
import { syncHeaderView } from './syncBarLabel'
import { PressableRow } from '../ui/Pressable'

/**
 * ヘッダー右（歯車の左）の同期チップ。タップで掲示→課題の順次同期（runFullSync）。
 * 状況は短縮形（「◯分前」/「同期中」/スキップ極短形/「要再同期」）でヘッダー幅に収める
 * （詳細なスキップ理由は課題/時間割タブの syncSkipMessage が担う）。掲示同期中はスピナー、
 * それ以外はアイコン。busy 中は押下演出ごと止める（disabled）。
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

  const view = syncHeaderView(
    {
      bulletinBusy: sync.bulletinBusy,
      assignmentBusy: sync.assignmentBusy,
      skip: sync.skip,
      bulletinHealth: sync.bulletinHealth,
      letusHealth: sync.letusHealth,
      lastSyncAt: sync.lastSyncAt,
    },
    now,
  )
  const busy = sync.bulletinBusy || sync.assignmentBusy
  const warn = view.kind === 'warn'
  const textColor = warn ? ui.colors.warn : ui.pillText

  return (
    <PressableRow
      style={[styles.chip, { backgroundColor: warn ? ui.colors.warnBg : ui.pillBg }]}
      onPress={requestFullSync}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="同期"
    >
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
    </PressableRow>
  )
}

const styles = StyleSheet.create({
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
