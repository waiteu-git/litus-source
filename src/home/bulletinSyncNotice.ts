/**
 * ホームの「CLASS掲示」手動更新をガードでスキップした時のユーザー向けフィードバック（純粋・RN非依存）。
 * リリースビルドでは診断表示（__DEV__限定）が出ないため、ボタンを押しても無反応＝故障に見える。
 * スキップ理由を判定し、更新ボタン付近に短時間出す文言へ写像する。
 */
import type { AccessReason } from '../health/accessGate'
import { maintenanceWindowLabel } from '../health/maintenanceWindow'

export type BulletinSyncSkipReason = 'offline' | 'maintenance' | 'attending'

/**
 * 手動更新をスキップすべき理由。null なら収集を開始してよい。
 * 優先度は既存ガード順と同じ accessGate（offline > maintenance）→ 授業中。
 */
export function bulletinSyncSkipReason(opts: {
  running: boolean
  access: AccessReason
}): BulletinSyncSkipReason | null {
  if (opts.access === 'offline') return 'offline'
  if (opts.access === 'maintenance') return 'maintenance'
  if (opts.running) return 'attending'
  return null
}

/** スキップ理由のユーザー向け文言。理由と「いつ取得できるか」をセットで伝える。 */
export function bulletinSyncSkipMessage(reason: BulletinSyncSkipReason): string {
  switch (reason) {
    case 'offline':
      return 'オフラインのため取得できません。接続後にもう一度お試しください。'
    case 'maintenance':
      return `CLASSはメンテナンス中です（毎日${maintenanceWindowLabel('class')}）。終了後に取得できます。`
    case 'attending':
      return '授業中のため取得を控えています。授業後に取得できます。'
  }
}
