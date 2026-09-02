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
import { APP_BUILD } from './appBuild'
// 解除の検知（設計 §4-Q1）。通知側は前面復帰の 2500ms スロットで古いキャッシュを読むため、
// これが無いと「解除したのに前面復帰2回ぶん戻らない」（15分スロットルに当たれば更に待つ）。
// ⚠ App.tsx の通知 effect は**動かさない**。あれが Provider の外に在るからこそ、all 停止中も
// 購読が生き残って解除後に貼り直せる（内側へ移すと解除しても二度と貼り直されない）。
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import { isKillSwitchReleased } from '../notifications/notificationSuppress'
import { fetchKillSwitchStatus } from './killSwitchFetch'
import { resolveNotice } from './notice'
import { loadKillSwitchCache, saveKillSwitchCache } from '../storage/killSwitchStore'
import { loadDismissedNoticeHash, saveDismissedNoticeHash } from '../storage/noticeStore'
import { subscribeForeground } from '../app/foregroundOrchestrator'
import { useDemo } from '../demo/DemoProvider'
import { NoticeBanner } from '../ui/NoticeBanner'
import { openLitusSite } from '../ui/openLitusSite'
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
 * - 起動時: キャッシュ読込（完了まで children を保留。ネットは待たない）→ 常に取得(force)。
 *   fetchは非ブロッキング（children はキャッシュから即描画）なので起動時間は延びない。停止指示を
 *   コールドスタートで確実に反映する（手順書「起動時に必ず確認」と一致）。
 * - フォアグラウンド復帰: killSwitchスロット（即時）で staleなら取得（15分スロットルで乱打防止）
 * - 取得失敗は直近キャッシュ維持・キャッシュ無しは通常動作（fail-open）
 * 設計: docs/2026-07-12-remote-kill-switch-design.md
 */
export function KillSwitchProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const [status, setStatus] = useState<KillSwitchStatus | null>(null)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  // お知らせ帯の既読ハッシュ。読込完了まで帯を出さない（消したはずの帯が一瞬見えるのを防ぐ）。
  // children の描画はこれを待たない。
  const [dismissedHash, setDismissedHash] = useState<string | null>(null)
  const [dismissedLoaded, setDismissedLoaded] = useState(false)
  const fetchedAtRef = useRef(0)
  const inFlightRef = useRef(false)
  // 直近の全停止状態（null＝未取得＝不明）。停止→解除の遷移だけを拾うために持つ。
  const lastDisabledAllRef = useRef<boolean | null>(null)
  // refresh は useCallback([]) で固定されるため、デモ状態は ref 経由で読む。
  const { active: demo } = useDemo()
  const demoRef = useRef(false)
  demoRef.current = demo

  const refresh = useCallback((force: boolean) => {
    // デモ中は稼働状況の照会もしない（デモ中はネットワークに一切出ない）。
    if (demoRef.current) return
    if (!force && !isKillSwitchStale(fetchedAtRef.current, Date.now())) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    fetchKillSwitchStatus(APP_BUILD)
      .then((s) => {
        if (!s) return // 失敗: 直近取得値を維持（fetchedAtも進めない＝次の機会に再試行）
        fetchedAtRef.current = Date.now()
        setStatus(s)
        const released = isKillSwitchReleased(lastDisabledAllRef.current, s.disabledAll)
        lastDisabledAllRef.current = s.disabledAll
        return saveKillSwitchCache({ status: s, fetchedAt: fetchedAtRef.current, build: APP_BUILD })
          .catch(() => undefined)
          .then(() => {
            // 🔴 必ずキャッシュ保存の**後**に叩く。先に叩くと関門が古い"停止"を読んで再び全キャンセルし、
            // 解除が1回ぶん無駄になる。保存自体の失敗は握り潰されたままで、そのときは次の復帰まで戻らない
            // （範囲外・台帳に別項目として登録済み）。
            if (released) return refreshAllNotifications().catch(() => undefined)
          })
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
        // versionRulesは自ビルドへ解決済みで保存されるため、別ビルドで解決したキャッシュは使わない
        // （アップデート直後に旧ビルド向け停止が一瞬適用されるのを防ぐ）。破棄しても起動時のforce取得で埋まる。
        if (cache && cache.build === APP_BUILD) {
          fetchedAtRef.current = cache.fetchedAt
          lastDisabledAllRef.current = cache.status.disabledAll
          setStatus(cache.status)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!active) return
        setCacheLoaded(true)
        refresh(true) // 起動時は常に取得（非ブロッキング＝起動時間に影響なし）。復帰時のみ15分スロットル。
      })
    return () => {
      active = false
    }
  }, [refresh])

  useEffect(() => subscribeForeground('killSwitch', () => refresh(false)), [refresh])

  useEffect(() => {
    let active = true
    loadDismissedNoticeHash()
      .then((h) => {
        if (active) setDismissedHash(h)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setDismissedLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const dismissNotice = useCallback((hash: string) => {
    // 先に画面から消す（保存の成否を待たせない）。保存に失敗しても次回また出るだけで実害はない。
    setDismissedHash(hash)
    saveDismissedNoticeHash(hash).catch(() => undefined)
  }, [])

  // キャッシュ読込完了まで入場保留（all停止キャッシュがあるのに一瞬起動して見えるのを防ぐ）。
  if (!cacheLoaded) return null

  if (isAppKilled(status)) {
    return (
      <View style={[styles.fill, { paddingTop: insets.top }]}>
        <View style={styles.card}>
          <Text style={styles.title}>{status?.title ?? 'リタスは一時停止中です'}</Text>
          <Text style={styles.body}>
            {status?.message ??
              '現在、リタスの提供を一時停止しています。ご不便をおかけしますが、再開までしばらくお待ちください。'}
          </Text>
          <Pressable style={styles.primary} onPress={() => refresh(true)}>
            <Text style={styles.primaryText}>再確認</Text>
          </Pressable>
          {/* 脱出リンク。停止中はアプリ内に情報源が無く、ここが唯一の外への導線になる
              （無いと発信できる場所がストアのレビュー欄だけになる）。URLはコード固定＝
              status.json が壊れて取得失敗でも必ず開ける。
              文言は中立表現で短く保つ（キルスイッチランブックの「復旧時期を約束しない」と整合。
              「復旧情報を見る」は復旧を前提にするため不可。URL併記もしない＝行き先はタップで分かる）。 */}
          <Pressable style={styles.secondary} onPress={openLitusSite} accessibilityRole="link">
            <Text style={styles.secondaryText}>最新情報を見る</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const notice = dismissedLoaded ? resolveNotice(status, { demo, dismissedHash }) : null

  return (
    <Ctx.Provider value={{ status, isKilled: (f) => isFeatureKilled(status, f), refresh: () => refresh(true) }}>
      {/* お知らせが無いときは children をそのまま返す（ラッパ View を挟まない＝通常時の
          レイアウトを1ノードも変えない）。 */}
      {notice ? (
        // NoticeBanner は上端（セーフエリア含む）まで自前で塗る全幅バー。ここで地色は与えない
        // （与えても帯の下は children が占めるので見えない）。
        <View style={styles.host}>
          <NoticeBanner text={notice.text} onDismiss={() => dismissNotice(notice.hash)} />
          {children}
        </View>
      ) : (
        children
      )}
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
  secondary: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 160,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.emerald,
  },
  secondaryText: { color: COLORS.emeraldDark, fontSize: 13, fontWeight: '700' },
  /** お知らせ帯を children の上に積むためのホスト。帯が無いときは挟まない。 */
  host: { flex: 1 },
})
