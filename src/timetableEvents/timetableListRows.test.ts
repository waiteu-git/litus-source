import { describe, expect, it } from 'vitest'
import { buildTimetableListRows } from './timetableListRows'
import type { PersonalEvent } from './personalEvent'

type Slot = { period: number; classes: string[] }
const slot = (period: number, ...classes: string[]): Slot => ({ period, classes })
const pe = (id: string, periods: number[]): PersonalEvent => ({
  id,
  title: id,
  day: 'mon',
  periods,
  place: null,
  note: null,
  color: null,
  createdAt: '2026-07-15T00:00:00.000Z',
})

describe('buildTimetableListRows', () => {
  it('個人予定なしは授業行のみ・period昇順', () => {
    const rows = buildTimetableListRows([slot(2, 'B'), slot(1, 'A')], [])
    expect(rows.map((r) => r.period)).toEqual([1, 2])
    expect(rows.every((r) => r.kind === 'class')).toBe(true)
  })

  it('0限の個人予定は1限授業の上（独立行・先頭）', () => {
    const rows = buildTimetableListRows([slot(1, 'A')], [pe('朝練', [0])])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kind: 'personal', period: 0 })
    expect(rows[1]).toMatchObject({ kind: 'class', period: 1 })
  })

  it('授業と重なる個人予定はその授業行に内包（枠を拡張）', () => {
    const rows = buildTimetableListRows([slot(3, 'A')], [pe('バイト', [3])])
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.kind).toBe('class')
    if (r.kind === 'class') {
      expect(r.personal.map((e) => e.id)).toEqual(['バイト'])
      expect(r.slots[0].classes).toEqual(['A'])
    }
  })

  it('授業の無い非0限の個人予定は最下部でなく時限位置の独立行', () => {
    const rows = buildTimetableListRows([slot(1, 'A'), slot(4, 'D')], [pe('部活', [3])])
    expect(rows.map((r) => r.period)).toEqual([1, 3, 4])
    expect(rows[1]).toMatchObject({ kind: 'personal', period: 3 })
  })

  it('複数コマの個人予定は最小periodにアンカー（1回だけ）', () => {
    const rows = buildTimetableListRows([], [pe('連続', [4, 5])])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'personal', period: 4 })
  })

  it('periods空の個人予定は除外', () => {
    const rows = buildTimetableListRows([slot(1, 'A')], [pe('空', [])])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'class', period: 1 })
  })

  it('同一時限に授業と個人予定が複数あってもまとめる', () => {
    const rows = buildTimetableListRows([slot(2, 'A')], [pe('x', [2]), pe('y', [2])])
    expect(rows).toHaveLength(1)
    const r = rows[0]
    if (r.kind === 'class') expect(r.personal.map((e) => e.id)).toEqual(['x', 'y'])
  })
})
