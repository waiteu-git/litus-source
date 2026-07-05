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
