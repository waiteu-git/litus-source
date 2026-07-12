import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseAttendanceStats } from './attendanceStats'

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, '__fixtures__', 'attendance-stats-real.html'), 'utf8')

describe('parseAttendanceStats', () => {
  const courses = parseAttendanceStats(html)

  it('FixedMidashiの複製を無視して本体3行だけ返す', () => {
    expect(courses).toHaveLength(3)
  })

  it('週複数コマの曜日時限を全て解釈する', () => {
    expect(courses[0].slots).toEqual([
      { day: 'mon', period: 1 },
      { day: 'fri', period: 3 },
    ])
  })

  it('科目コード・科目名・出席率を取り出す', () => {
    expect(courses[0].courseCode).toBe('9973337')
    expect(courses[0].courseName).toContain('基礎電気数学及び演習')
    expect(courses[0].ratePercent).toBe(91)
  })

  it('各回の記号と日付を記号テキストで判定する', () => {
    expect(courses[0].sessions[0]).toEqual({ date: '04/13', mark: 'absent' })
    expect(courses[0].sessions[1]).toEqual({ date: '04/17', mark: 'present' })
    expect(courses[0].sessions[3].mark).toBe('canceled') // 休
    expect(courses[0].sessions[4].mark).toBe('none') // 全角スペース
  })

  it('出席管理対象外は出席率null・全マークnone', () => {
    expect(courses[1].ratePercent).toBeNull()
    expect(courses[1].slots).toHaveLength(2)
    expect(courses[1].sessions.every((s) => s.mark === 'none')).toBe(true)
  })

  it('隔週パターンの出席/欠席を並び順どおり返す', () => {
    expect(courses[2].courseCode).toBe('9973366')
    expect(courses[2].ratePercent).toBe(54)
    expect(courses[2].sessions.map((s) => s.mark)).toEqual([
      'present', 'absent', 'present', 'absent', 'present',
    ])
  })
})
