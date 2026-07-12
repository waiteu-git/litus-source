/**
 * LETUSフル同期ステージ2（course/view.php 巡回）の訪問対象を絞る純粋関数（大学サーバー負荷軽減）。
 *
 * my/courses.php はコース名＋URLリンクしか持たず、コースの「中身が更新されたか」のシグナルを
 * 露出しない（実測確定）。よってステージ1署名で無変化コースを判定することはできない。代わりに、
 * 既に永続化されているスナップショットの収集時刻 collectedAt の鮮度でゲートする:
 *   - スナップショット無し（新規コース/初回）→ 必ず巡回（締切・活動を知るため）
 *   - collectedAt が壊れている/パース不能 → 必ず巡回（安全側）
 *   - collectedAt が TTL より古い → 巡回（新着発見の遅延を TTL で上限化）
 *   - TTL 内に収集済み → スキップ（前回スナップショットを保持したまま使う）
 *
 * これで前面復帰のたびに全コースを再巡回する冗長を消しつつ、**どのコースも最大 TTL ごとに必ず
 * 再巡回される**ため新着課題・更新コースを永続的に取りこぼすことはない（発見遅延 ≤ TTL）。
 * スキップされたコースの課題は、保持済みスナップショットの activities から従来通り締切窓
 * (selectAssignmentsToVisit) で再取得されるので、締切/提出状態の鮮度は劣化しない。
 */
import type { CourseSnapshotMap } from '../storage/courseSnapshotSerialize'

// 新着発見の最大許容遅延。TTL 内に収集済みのコースはステージ2の再巡回をスキップする。
export const COURSE_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000

export function selectCoursesToSnapshot(
  courseUrls: string[],
  snapshots: CourseSnapshotMap,
  now: Date = new Date(),
  ttlMs: number = COURSE_SNAPSHOT_TTL_MS,
): string[] {
  const nowMs = now.getTime()
  return courseUrls.filter((url) => {
    const snap = snapshots[url]
    if (!snap) return true // 未収集は必ず巡回
    const collectedMs = new Date(snap.collectedAt).getTime()
    if (Number.isNaN(collectedMs)) return true // 壊れた収集時刻は再巡回（安全側）
    return nowMs - collectedMs > ttlMs // TTL 超過のみ再巡回、鮮度内はスキップ
  })
}
