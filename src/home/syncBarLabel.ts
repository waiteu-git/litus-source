/**
 * ホーム上部の同期バーの表示内容を決める純粋関数。優先度は
 * 掲示同期中 > スキップ理由 > 課題同期中 > ヘルス注意 > 鮮度。
 * スキップを課題同期中より上に置くのは、統合同期で掲示フェーズだけスキップされた場合
 * （授業中/CLASSメンテ）に理由が「課題を同期中…」の裏で消えて見えなくなるのを防ぐため。
 * 課題フェーズはホームでは演出しない方針のため busy でも文言のみ（スピナーは掲示フェーズ限定を
 * kind で区別する）。スキップ文言はバー幅に収まる短縮形（詳細文言は syncSkipMessage が正）。
 */
import type { StoredHealth } from '../storage/collectionHealthSerialize'
import type { SyncSkipReason } from '../health/syncSkipNotice'
import { formatSyncAgo, formatSyncAgoShort } from '../health/syncAgo'

export type SyncBarInput = {
  bulletinBusy: boolean
  assignmentBusy: boolean
  skip: { feature: 'class' | 'letus'; reason: SyncSkipReason } | null
  bulletinHealth: StoredHealth | null
  letusHealth: StoredHealth | null
  lastSyncAt: number | null
}

export type SyncBarView = {
  /** busySpinner=掲示同期中（スピナー表示）／busyQuiet=課題同期中（文言のみ）。 */
  kind: 'busySpinner' | 'busyQuiet' | 'skip' | 'warn' | 'fresh'
  text: string
}

/** バー向けの短いスキップ文言。詳細は syncSkipMessage（画面内通知用）が正。 */
export function syncBarSkipText(feature: 'class' | 'letus', reason: SyncSkipReason): string {
  switch (reason) {
    case 'offline':
      return 'オフライン・接続後に同期できます'
    case 'maintenance':
      return feature === 'letus' ? 'LETUSメンテナンス中・終了後に同期' : 'CLASSメンテナンス中・終了後に同期'
    case 'attending':
      return '授業中・掲示は授業後に同期します'
    case 'stopped':
      // feature単位で表現する: 掲示だけ停止中でも課題フェーズは走り得る（「同期は停止中」と
      // 言い切ると直後の「課題を同期中…」と矛盾する）。
      return feature === 'letus' ? '課題の同期は一時停止中です' : '掲示の同期は一時停止中です'
    case 'demo':
      return 'デモ表示中・サンプルデータです'
  }
}

/** 収集ヘルスが「最新を取得できていない可能性」を示すか。環境起因(maintenance/blocked)は除外。 */
export function healthWarn(bulletinHealth: StoredHealth | null, letusHealth: StoredHealth | null): boolean {
  const bad = (h: StoredHealth | null) =>
    h != null && (h.health.status === 'structure_drift' || h.health.status === 'not_logged_in')
  return bad(bulletinHealth) || bad(letusHealth)
}

export function syncBarView(input: SyncBarInput, now: Date): SyncBarView {
  if (input.bulletinBusy) return { kind: 'busySpinner', text: '同期中…' }
  if (input.skip) return { kind: 'skip', text: syncBarSkipText(input.skip.feature, input.skip.reason) }
  if (input.assignmentBusy) return { kind: 'busyQuiet', text: '課題を同期中…' }
  if (healthWarn(input.bulletinHealth, input.letusHealth))
    return { kind: 'warn', text: '最新を取得できていない可能性・タップで再同期' }
  return { kind: 'fresh', text: formatSyncAgo(input.lastSyncAt, now) }
}

/** ヘッダーのスキップ理由（1〜5字の極短形。詳細文言は syncSkipMessage が正）。 */
function syncHeaderSkipText(reason: SyncSkipReason): string {
  switch (reason) {
    case 'offline':
      return 'オフライン'
    case 'maintenance':
      return 'メンテ中'
    case 'attending':
      return '授業中'
    case 'stopped':
      return '停止中'
    case 'demo':
      return 'デモ'
  }
}

/**
 * ヘッダー右の同期チップ用ビュー。kind の優先順位は syncBarView に一任し（単一の真実）、
 * text だけを狭いヘッダー幅に収まる短縮形へ差し替える。掲示/課題どちらの同期中も「同期中」に畳む
 * （ヘッダーではフェーズ差を出さない）。詳細なスキップ理由は課題/時間割タブの syncSkipMessage が担う。
 */
export function syncHeaderView(input: SyncBarInput, now: Date): SyncBarView {
  const kind = syncBarView(input, now).kind
  switch (kind) {
    case 'busySpinner':
    case 'busyQuiet':
      return { kind, text: '同期中' }
    case 'skip':
      return { kind, text: input.skip ? syncHeaderSkipText(input.skip.reason) : '同期' }
    case 'warn':
      return { kind, text: '要再同期' }
    case 'fresh':
      return { kind, text: formatSyncAgoShort(input.lastSyncAt, now) }
  }
}
