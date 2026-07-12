import { describe, expect, it } from 'vitest'
import { selectCoursesToSnapshot, COURSE_SNAPSHOT_TTL_MS } from './courseSnapshotWindow'
import type { CourseSnapshot, CourseSnapshotMap } from '../storage/courseSnapshotSerialize'

const now = new Date('2026-07-13T12:00:00Z')

function snap(collectedAt: string): CourseSnapshot {
  return { activities: [{ title: 't', url: 'x' }], collectedAt, added: [], removed: [] }
}

describe('selectCoursesToSnapshot', () => {
  it('snapshot無し（未収集コース）は必ず巡回', () => {
    const r = selectCoursesToSnapshot(['a'], {}, now)
    expect(r).toEqual(['a'])
  })

  it('TTL内に収集済みのコースはスキップ', () => {
    // 1時間前に収集（TTL=6h内）
    const map: CourseSnapshotMap = { a: snap('2026-07-13T11:00:00Z') }
    expect(selectCoursesToSnapshot(['a'], map, now)).toEqual([])
  })

  it('TTL超過（古い）コースは再巡回', () => {
    // 7時間前に収集（TTL=6h超）
    const map: CourseSnapshotMap = { a: snap('2026-07-13T05:00:00Z') }
    expect(selectCoursesToSnapshot(['a'], map, now)).toEqual(['a'])
  })

  it('collectedAtが壊れている（パース不能）は再巡回（安全側）', () => {
    const map: CourseSnapshotMap = { a: snap('not-a-date') }
    expect(selectCoursesToSnapshot(['a'], map, now)).toEqual(['a'])
  })

  it('境界: ちょうどTTL経過はまだ鮮度内としてスキップ', () => {
    // ちょうど6時間前
    const map: CourseSnapshotMap = { a: snap('2026-07-13T06:00:00Z') }
    expect(selectCoursesToSnapshot(['a'], map, now)).toEqual([])
  })

  it('混在: 新規＋古い＝巡回、TTL内＝スキップ。入力順を保持', () => {
    const map: CourseSnapshotMap = {
      fresh: snap('2026-07-13T10:00:00Z'), // 2h前 → skip
      stale: snap('2026-07-12T00:00:00Z'), // 36h前 → visit
    }
    const r = selectCoursesToSnapshot(['fresh', 'stale', 'brandnew'], map, now)
    expect(r).toEqual(['stale', 'brandnew'])
  })

  it('全コースがTTL内なら空配列（ステージ2を丸ごとスキップできる）', () => {
    const map: CourseSnapshotMap = {
      a: snap('2026-07-13T11:00:00Z'),
      b: snap('2026-07-13T10:30:00Z'),
    }
    expect(selectCoursesToSnapshot(['a', 'b'], map, now)).toEqual([])
  })

  it('空の入力は空配列', () => {
    expect(selectCoursesToSnapshot([], {}, now)).toEqual([])
  })

  it('TTLはデフォルト6時間', () => {
    expect(COURSE_SNAPSHOT_TTL_MS).toBe(6 * 60 * 60 * 1000)
  })
})
