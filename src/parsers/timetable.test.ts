import { parseClassCell } from './timetable'
import { CELL_FILLED, CELL_REMOTE, CELL_EMPTY } from './timetable.fixtures'

describe('parseClassCell', () => {
  it('対面授業セルを構造化する', () => {
    const c = parseClassCell(CELL_FILLED)
    expect(c).not.toBeNull()
    expect(c!.name).toBe('基礎電気数学及び演習 （１組）')
    expect(c!.teachers).toEqual(['王　宇凱'])
    expect(c!.room).toBe('野：445教室')
    expect(c!.isRemote).toBe(false)
    expect(c!.courseCode).toBe('9973337')
    expect(c!.credits).toBe(2.0)
    expect(c!.badges).toEqual(['複数回'])
  })

  it('遠隔授業を isRemote=true にし、バッジなしは空配列', () => {
    const c = parseClassCell(CELL_REMOTE)
    expect(c).not.toBeNull()
    expect(c!.name).toBe('データサイエンス・ＡＩ概論 （前期）')
    expect(c!.courseCode).toBe('9960219')
    expect(c!.room).toBe('遠隔（オンライン）')
    expect(c!.isRemote).toBe(true)
    expect(c!.badges).toEqual([])
  })

  it('ui-button ノイズを混入させない', () => {
    const c = parseClassCell(CELL_FILLED)
    expect(JSON.stringify(c)).not.toContain('ui-button')
  })

  it('空きコマ（noClass）は null', () => {
    expect(parseClassCell(CELL_EMPTY)).toBeNull()
  })
})

import { parsePeriodTimes } from './timetable'
import { JIGEN_AREA_NODA } from './timetable.fixtures'

describe('parsePeriodTimes', () => {
  it('野田キャンパスの時限時刻を全7限パースする', () => {
    const r = parsePeriodTimes(JIGEN_AREA_NODA)
    expect(r).not.toBeNull()
    expect(r!.campus).toBe('野田')
    expect(r!.periods).toHaveLength(7)
    expect(r!.periods[0]).toEqual({ period: 1, start: '08:50', end: '10:20' })
    expect(r!.periods[6]).toEqual({ period: 7, start: '19:50', end: '21:20' })
  })

  it('全角チルダ ～ と半角 ~ の両方を許容する', () => {
    const r = parsePeriodTimes('神楽坂（1限 09:00~10:30）')
    expect(r).not.toBeNull()
    expect(r!.campus).toBe('神楽坂')
    expect(r!.periods[0]).toEqual({ period: 1, start: '09:00', end: '10:30' })
  })

  it('パースできない入力は null', () => {
    expect(parsePeriodTimes('')).toBeNull()
    expect(parsePeriodTimes('時間割情報なし')).toBeNull()
  })
})
