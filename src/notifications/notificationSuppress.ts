/**
 * kill switch（`disabled:["all"]`）で予約通知を止めるかどうかの判定（純粋・RN非依存）。
 *
 * 関門は `notificationRefresh.refreshAllNotifications` 1箇所だが、あのファイルは AsyncStorage を
 * 引き込むため vitest から読めない。判定をここへ出してテストで固定する
 * （同じ理由で過去に classEventNotify の文面が壊れた実績がある）。
 *
 * 設計: docs/design/2026-09-02-killswitch-notification-cancel.md
 */
import type { KillSwitchCache } from '../storage/killSwitchSerialize'

/**
 * 予約通知を止めるか。**倒す向きは fail-open**（判断できない状態は「停止なし＝従来どおり」）。
 *
 * - `null`（新規インストールでキャッシュ未作成）は**正常な状態**であって停止指示ではない。
 * - 🔴 `cache.build !== appBuild` は無視する。versionRules は自ビルドへ解決済みで保存されるため、
 *   旧ビルド向けに解決された停止指示をアプリ更新後に流用すると、**画面は動くのに通知だけ黙る**
 *   （`KillSwitchProvider` は同じガードでキャッシュを破棄するので、両者が食い違う）。
 *   判定式は Provider 側（`cache.build === APP_BUILD`）と必ず同じ形に保つこと。
 */
export function shouldSuppressNotifications(
  cache: KillSwitchCache | null,
  appBuild: number | null,
): boolean {
  if (!cache) return false
  if (cache.build !== appBuild) return false
  return cache.status.disabledAll
}

/**
 * キャッシュを読んで判定する。**読みが例外を投げても fail-open**（予約は従来どおり続ける）。
 *
 * 理由＝ここで fail-closed にすると、一過性のストレージ例外が「全通知が黙る」に直結し、利用者から
 * 見て原因不明の恒久故障になる。`all` を打つ状況ではアプリ画面自体が既に止まっているので通知だけ
 * 残っても被害は限定的だが、誤爆は平時の全ユーザーに効く（非対称性がこちら向き）。
 * ⚠ ただし**例外は握り潰さない**。`onError` へ渡して呼び出し側の診断に残す（設計 §4-Q5）。
 * 正常な `null` は失敗ではないので `onError` を呼ばない。
 */
export async function resolveNotificationSuppression(
  load: () => Promise<KillSwitchCache | null>,
  appBuild: number | null,
  onError: (e: unknown) => void,
): Promise<boolean> {
  try {
    return shouldSuppressNotifications(await load(), appBuild)
  } catch (e) {
    onError(e)
    return false
  }
}

/**
 * 停止→解除の遷移か。解除の検知を待ち受け側（`KillSwitchProvider`）が持たないと、
 * 通知は次の前面復帰で古いキャッシュを読んで再び全キャンセルし、**復帰が2回必要**になる
 * （設計 §4-Q1）。直前の状態が不明（`null`＝未取得）なら遷移とみなさない。
 */
export function isKillSwitchReleased(prev: boolean | null, next: boolean): boolean {
  return prev === true && next === false
}
