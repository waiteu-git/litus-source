import { describe, expect, it } from 'vitest'
import { extractCourseCodes, firstCourseCode, isCourseCode } from './courseCode'

describe('courseCode（英字入り科目IDに対応）', () => {
  it('数字のみのコード', () => {
    expect(isCourseCode('9975311')).toBe(true)
    expect(firstCourseCode('物理学実験A (9975311)')).toBe('9975311')
  })
  it('英字入りコード（9975A06 / 9960E09 / 9960S01）', () => {
    expect(isCourseCode('9975A06')).toBe(true)
    expect(isCourseCode('9960E09')).toBe(true)
    expect(isCourseCode('9960S01')).toBe(true)
    expect(firstCourseCode('機械航空宇宙力学1 (9975A06)')).toBe('9975A06')
    expect(firstCourseCode('創域特別講義 (9960S01)')).toBe('9960S01')
  })
  it('統合コースは複数コードを全部拾う（英字混在も）', () => {
    expect(extractCourseCodes('経済学（火3）(9960107+9990290)')).toEqual(['9960107', '9990290'])
    expect(extractCourseCodes('創域特別講義 (9960S01+9990S01)')).toEqual(['9960S01', '9990S01'])
    expect(extractCourseCodes('物理学実験A(火1-2)(9963230+9974562+9975311)')).toEqual([
      '9963230',
      '9974562',
      '9975311',
    ])
  })
  it('コードが無ければ空', () => {
    expect(extractCourseCodes('特別講義（コード無し）')).toEqual([])
    expect(firstCourseCode('教室 K603 ・ 松崎 亮介')).toBeNull()
  })
  it('7文字ちょうどでなければコードでない', () => {
    expect(isCourseCode('997531')).toBe(false)
    expect(isCourseCode('99753110')).toBe(false)
    expect(isCourseCode('K603')).toBe(false)
  })
})
