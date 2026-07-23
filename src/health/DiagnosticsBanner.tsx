/**
 * LETUS 自己診断のアプリ内常設インラインバナー（spec§7・T6）。
 *
 * LTW は診断を一切プッシュしない（popup を開いた時だけ見える pull 型 <section>）。忠実な RN 等価物は
 * ホーム/課題タブ最上部の「常設インラインバナー＋再試行ボタン」であって、システム通知にはしない
 * （通知アーキテクチャの「即時型は前面のみ」方針とも整合・スコープ増を避ける）。
 *
 * 表示物の決定はすべて純関数（diagnosticsBanner.ts）に委譲し、ここは:
 * - useDiagnostics() で live な台帳を購読（スキャン完了で SyncProvider が applyState を push）。
 * - buildBannerContent / buildInfoNotes / formatLastGoodAt の戻り値を意味色トークンへ流す。
 * - 種別ごとの導線（logged_out→再ログイン / それ以外→再取得）を配線する。
 *
 * デモ規律: デモ中は常に null を返す（実診断がデモ画面へ漏れない）。DiagnosticsProvider 側も
 * デモ名前空間を読み直すが、UI 側でも独立に塞いで二重の保険とする（storageFacadeGuard 非退行）。
 *
 * 色は意味色ロール（ui.colors.warn/warnBg・ui.card 等）のみ使用＝生色直書きしない（デザイン刷新の規律）。
 */
import { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../ui/Text'
import { PressableRow } from '../ui/Pressable'
import { useUi } from '../ui/screen'
import { SPACE } from '../ui/scale'
import { useDemo } from '../demo/DemoProvider'
import { useDiagnostics } from './DiagnosticsProvider'
import { useSync } from '../sync/SyncProvider'
import { useLoginGate } from '../auth/LoginGate'
import { buildBannerContent, buildInfoNotes, formatLastGoodAt, type BannerKind } from './diagnosticsBannerContent'

/** 種別ごとのアイコン。logged_out はログイン導線、それ以外は「読み取り不調」を表す。 */
const KIND_ICON: Record<Exclude<BannerKind, 'none'>, keyof typeof Ionicons.glyphMap> = {
  logged_out: 'log-in-outline',
  unreadable: 'alert-circle-outline',
  unsupported: 'information-circle-outline',
}

/**
 * @param compact 課題タブなど、上部に別のヘッダーがある面で余白を詰める（既定 false＝ホーム用）。
 */
export default function DiagnosticsBanner({ compact = false }: { compact?: boolean }) {
  const ui = useUi()
  const { active: demo } = useDemo()
  const { state } = useDiagnostics()
  const { runFullSync } = useSync()
  const { requireLogin } = useLoginGate()

  const banner = buildBannerContent(state)
  const infoNotes = buildInfoNotes(state)

  const onRetry = useCallback(() => {
    if (banner.kind === 'logged_out') {
      // 再ログインを要求（LoginGate が全面 SSO を出す）。ログインが済めば次サイクルの clean スキャンで
      // activeCodes が空になりバナーは自然消滅する。
      requireLogin()
      return
    }
    // 読み取り不調は手動フル同期で取り直す（掲示→出欠→課題）。成功すればバナーは消える。
    runFullSync({ source: 'user' })
  }, [banner.kind, requireLogin, runFullSync])

  // デモ中は実診断を出さない（規律）。
  if (demo) return null

  // 警告バナー（activeCodes 由来）。unsupported は info トーン、それ以外は warn トーン。
  if (banner.kind !== 'none') {
    const isWarn = banner.kind !== 'unsupported'
    const tone = isWarn ? ui.colors.warn : ui.labelColor
    const boxBg = isWarn ? ui.colors.warnBg : ui.colors.softBoxBg
    const lastGood = formatLastGoodAt(banner.lastGoodAt, new Date())
    const ctaLabel = banner.kind === 'logged_out' ? 'ログインし直す' : '再取得する'
    return (
      <View style={[styles.box, compact && styles.compact, { backgroundColor: boxBg }]}>
        <Ionicons name={KIND_ICON[banner.kind]} size={18} color={tone} style={styles.leadIcon} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: tone }]}>{banner.title}</Text>
          <Text style={[styles.text, { color: ui.valueColor }]}>{banner.body}</Text>
          {lastGood ? <Text style={[styles.meta, { color: ui.labelColor }]}>{lastGood}</Text> : null}
          <PressableRow onPress={onRetry} hitSlop={8} accessibilityRole="button" style={styles.ctaRow}>
            <Ionicons
              name={banner.kind === 'logged_out' ? 'log-in-outline' : 'refresh'}
              size={14}
              color={tone}
            />
            <Text style={[styles.cta, { color: tone }]}>{ctaLabel}</Text>
          </PressableRow>
        </View>
      </View>
    )
  }

  // 情報ノート（infoCodes 由来・警告バナーと排他）。カバレッジの正直な注記＝再試行導線は付けない。
  if (infoNotes.length > 0) {
    return (
      <View style={[styles.note, compact && styles.compact, { backgroundColor: ui.colors.softBoxBg }]}>
        <Ionicons name="information-circle-outline" size={16} color={ui.labelColor} style={styles.leadIcon} />
        <View style={styles.body}>
          {infoNotes.map((n) => (
            <Text key={n.code} style={[styles.text, { color: ui.labelColor }]}>
              {n.text}
            </Text>
          ))}
        </View>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: SPACE.s3,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: SPACE.s3,
  },
  compact: { marginBottom: SPACE.s2 },
  leadIcon: { marginTop: 1 },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  text: { fontSize: 12, lineHeight: 17 },
  meta: { fontSize: 11, marginTop: 1 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start' },
  cta: { fontSize: 12, fontWeight: '700' },
})
