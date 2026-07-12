import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  isAppKilled,
  isFeatureKilled,
  isKillSwitchStale,
  type KillSwitchFeature,
  type KillSwitchStatus,
} from './killSwitch'
import { fetchKillSwitchStatus } from './killSwitchFetch'
import { loadKillSwitchCache, saveKillSwitchCache } from '../storage/killSwitchStore'
import { subscribeForeground } from '../app/foregroundOrchestrator'
import { COLORS } from '../theme'

type KillSwitchValue = {
  status: KillSwitchStatus | null
  isKilled: (feature: KillSwitchFeature) => boolean
  /** スロットル無視で再取得する（全停止画面の「再確認」用）。 */
  refresh: () => void
}

// Provider外（テスト等）はfail-open: 何も止めない。
const Ctx = createContext<KillSwitchValue>({ status: null, isKilled: () => false, refresh: () => {} })

export function useKillSwitch(): KillSwitchValue {
  return useContext(Ctx)
}

/** 当該機能が停止中なら children をマウントしない（収集エンジンの機能別停止用）。 */
export function KillSwitchGate({ feature, children }: { feature: KillSwitchFeature; children: ReactNode }) {
  const { isKilled } = useKillSwitch()
  if (isKilled(feature)) return null
  return <>{children}</>
}

/**
 * リモートkill switch（大学要請時24h以内停止の技術的前提・層1）。
 * LoginGateの外側に置く: all停止時はログインprobe用WebViewすらマウントさせず、
 * 大学システムへの一切のアクセスを止める。status.jsonを読むだけで何も送らない。
 *
 * - 起動時: キャッシュ読込（完了まで children を保留。ネットは待たない）→ staleなら取得
 * - フォアグラウンド復帰: killSwitchスロット（即時）で staleなら取得
 * - 取得失敗は直近キャッシュ維持・キャッシュ無しは通常動作（fail-open）
 * 設計: docs/2026-07-12-remote-kill-switch-design.md
 */
export function KillSwitchProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const [status, setStatus] = useState<KillSwitchStatus | null>(null)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  const fetchedAtRef = useRef(0)
  const inFlightRef = useRef(false)

  const refresh = useCallback((force: boolean) => {
    if (!force && !isKillSwitchStale(fetchedAtRef.current, Date.now())) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    fetchKillSwitchStatus()
      .then((s) => {
        if (!s) return // 失敗: 直近取得値を維持（fetchedAtも進めない＝次の機会に再試行）
        fetchedAtRef.current = Date.now()
        setStatus(s)
        return saveKillSwitchCache({ status: s, fetchedAt: fetchedAtRef.current }).catch(() => undefined)
      })
      .finally(() => {
        inFlightRef.current = false
      })
  }, [])

  useEffect(() => {
    let active = true
    loadKillSwitchCache()
      .then((cache) => {
        if (!active) return
        if (cache) {
          fetchedAtRef.current = cache.fetchedAt
          setStatus(cache.status)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!active) return
        setCacheLoaded(true)
        refresh(false)
      })
    return () => {
      active = false
    }
  }, [refresh])

  useEffect(() => subscribeForeground('killSwitch', () => refresh(false)), [refresh])

  // キャッシュ読込完了まで入場保留（all停止キャッシュがあるのに一瞬起動して見えるのを防ぐ）。
  if (!cacheLoaded) return null

  if (isAppKilled(status)) {
    return (
      <View style={[styles.fill, { paddingTop: insets.top }]}>
        <View style={styles.card}>
          <Text style={styles.title}>リタスは一時停止中です</Text>
          <Text style={styles.body}>
            {status?.message ??
              '現在、リタスの提供を一時停止しています。ご不便をおかけしますが、再開までしばらくお待ちください。'}
          </Text>
          <Pressable style={styles.primary} onPress={() => refresh(true)}>
            <Text style={styles.primaryText}>再確認</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <Ctx.Provider value={{ status, isKilled: (f) => isFeatureKilled(status, f), refresh: () => refresh(true) }}>
      {children}
    </Ctx.Provider>
  )
}

// LoginGateのmaintenanceカードと同型（全停止はメンテと同じ「入場できない」提示）。
const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: COLORS.gradBottom,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 12,
  },
  title: { color: COLORS.emeraldDark, fontSize: 18, fontWeight: '700' },
  body: { color: '#3a4b45', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  primary: {
    marginTop: 4,
    backgroundColor: COLORS.cta,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  primaryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
})
