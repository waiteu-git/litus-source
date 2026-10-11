/**
 * 掲示1件へのアクション（詳細を開く・一覧の「既読にする」・ブックマーク）を止めるかの判定（純粋・RN非依存）。
 *
 * - CLASS のメンテ帯・オフライン（accessGate）に加えて、リモート停止キー `bulletin`（`all` を含む）でも止める。
 * - 停止の読みは isFeatureKilled に委ねる＝status が null（未取得・新規インストール・更新直後）なら許可（fail-open）。
 *   止める側に倒すと、waiteu.dev に届かない間は全員が掲示を開けなくなる。
 * - 真偽ではなく status を受け取るのは、キーの選択（'bulletin'）をここに置いてテストで固定するため
 *   （呼び出し側で isKilled('letus') と書き違えても型は通ってしまう）。
 * - 理由（stopped/offline/maintenance）は返さない。今の呼び出し側は真偽しか使わない。
 *
 * 呼び出し元は BulletinActionEngine だけ。status は useKillSwitch() から渡すこと
 * （保存済みの停止状態を直接読むと、別ビルドで解決したものを捨てる Provider のガードを失う）。
 * 設計: docs/design/2026-09-12-v11-train1-KS.md
 */
import type { AccessDecision } from '../health/accessGate'
import { isFeatureKilled, type KillSwitchStatus } from '../health/killSwitch'

export function isBulletinActionBlocked(access: AccessDecision, kill: KillSwitchStatus | null): boolean {
  return !access.allowed || isFeatureKilled(kill, 'bulletin')
}
