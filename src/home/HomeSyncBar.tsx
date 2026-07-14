import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../ui/Text'
import { useUi } from '../ui/screen'
import { useSync } from '../sync/SyncProvider'
import { syncBarView } from './syncBarLabel'
import { PressableRow } from '../ui/Pressable'

/**
 * ホーム上部の統合同期バー。タップで掲示→課題の順次同期（runFullSync）。
 * 平常時は「◯分前に同期」の鮮度、掲示同期中はスピナー、課題同期中は文言のみ（ホームは無演出の方針）、
 * スキップ理由（オフライン/授業中/メンテ）とヘルス注意はここに集約する（掲示セクションからは撤去済み）。
 */
export default function HomeSyncBar() {
  const ui = useUi()
  const sync = useSync()
  // 「◯分前」の追随用に分単位で再評価（ホーム本体の tick とは独立・バーだけ再レンダー）。
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const view = syncBarView(
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
  const textColor = warn ? ui.colors.warn : ui.labelColor

  return (
    <PressableRow
      style={[ui.card, styles.bar]}
      onPress={busy ? undefined : () => sync.runFullSync({ source: 'user' })}
      accessibilityRole="button"
      accessibilityLabel="同期"
    >
      {view.kind === 'busySpinner' ? (
        <ActivityIndicator size="small" color={ui.accent} />
      ) : (
        <Ionicons
          name={warn ? 'alert-circle-outline' : view.kind === 'skip' ? 'information-circle-outline' : 'refresh'}
          size={16}
          color={warn ? ui.colors.warn : ui.accent}
        />
      )}
      <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
        {view.text}
      </Text>
      <View style={styles.spacer} />
      {!busy ? <Text style={[styles.action, { color: ui.accentSoft }]}>同期</Text> : null}
    </PressableRow>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  text: { fontSize: 12, flexShrink: 1 },
  spacer: { flex: 1 },
  action: { fontSize: 12, fontWeight: '600' },
})
