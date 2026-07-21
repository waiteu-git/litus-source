/**
 * 手動更新（掲示/時間割/課題）をガードでスキップした時のユーザー向けフィードバック（純粋・RN非依存）。
 * リリースビルドでは診断表示（__DEV__限定）が出ないため、押しても無反応＝故障に見える。
 * スキップ理由を判定し、更新導線付近に短時間出す文言へ写像する。source で CLASS / LETUS を切り替える。
 */
import type { AccessDecision } from './accessGate'
import { maintenanceWindowLabel, systemDisplayName, type MaintenanceSystem } from './maintenanceWindow'

/** 'stopped' はリモートkill switch（機能停止中）。syncSkipReason は返さず SyncProvider だけが設定する。 */
export type SyncSkipReason = 'offline' | 'maintenance' | 'attending' | 'stopped' | 'demo'

/**
 * 手動更新をスキップすべき理由。null なら収集を開始してよい。
 * ゲート判定は AccessDecision.allowed を単一の真実とする（reason だけを見て分岐しない）。
 * これにより accessGate に将来 'ok/offline/maintenance' 以外の不許可理由が増えても、
 * 収集は必ず止まりユーザーにも理由が出る（null に落ちて収集ガードが静かに外れる＝本バグ再発を防ぐ）。
 * running は「出席WebViewがCLASSセッションを専有中」を表す。CLASS収集で競合する画面(Home)だけが渡す。
 * running を渡さない画面(LETUS収集/競合の無い画面)は attending が発生しない。
 * 優先度は既存ガード順と同じ accessGate（offline > maintenance）→ 授業中。
 */
export function syncSkipReason(opts: {
  access: AccessDecision
  running?: boolean
}): SyncSkipReason | null {
  if (!opts.access.allowed) {
    // allowed:false のとき reason は 'offline' | 'maintenance'（accessGateの全単射）。
    // 万一それ以外でも、収集は止めたうえでメンテ扱いの文言を出す（無反応にはしない）。
    return opts.access.reason === 'offline' ? 'offline' : 'maintenance'
  }
  if (opts.running) return 'attending'
  return null
}

/** スキップ理由のユーザー向け文言。理由と「いつ取得できるか」をセットで伝える。 */
export function syncSkipMessage(source: MaintenanceSystem, reason: SyncSkipReason): string {
  switch (reason) {
    case 'demo':
      // デモでは収集を回さない。無反応だと審査員に「壊れている」と見えるので理由を出す。
      return 'デモ表示中のため取得は行いません（サンプルデータを表示しています）。'
    case 'offline':
      return 'オフラインのため取得できません。接続後にもう一度お試しください。'
    case 'maintenance':
      return `${systemDisplayName(source)}はメンテナンス中です（毎日${maintenanceWindowLabel(source)}）。終了後に取得できます。`
    case 'attending':
      return '授業中のため取得を控えています。授業後に取得できます。'
    case 'stopped':
      return '同期は現在一時停止中です。再開までしばらくお待ちください。'
  }
}
