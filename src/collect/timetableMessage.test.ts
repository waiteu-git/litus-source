import { parseCollectionMessage } from './timetableMessage'
import { TABLE_MINIMAL, JIGEN_AREA_NODA } from '../parsers/timetable.fixtures'

describe('parseCollectionMessage', () => {
  it('正常なペイロードをスロットと時限時刻に構造化する', () => {
    const raw = JSON.stringify({ type: 'timetable', table: TABLE_MINIMAL, jigen: JIGEN_AREA_NODA })
    const r = parseCollectionMessage(raw)
    expect(r.error).toBeNull()
    expect(r.slots).toHaveLength(2)
    expect(r.periodTimes?.campus).toBe('野田')
    expect(r.periodTimes?.periods).toHaveLength(7)
  })

  it('JSONとして壊れていればエラーを返す', () => {
    const r = parseCollectionMessage('not-json')
    expect(r.slots).toEqual([])
    expect(r.periodTimes).toBeNull()
    expect(r.error).toBe('メッセージを解析できませんでした')
  })

  it('tableが空ならエラーを返す', () => {
    const r = parseCollectionMessage(JSON.stringify({ type: 'timetable', table: '', jigen: '' }))
    expect(r.error).toBe('時間割テーブルが見つかりませんでした')
  })

  it('tableに授業が無ければ読み取り失敗エラー', () => {
    const empty = '<table class="classTable"><tr><th class="headerYobi">月曜日</th></tr></table>'
    const r = parseCollectionMessage(JSON.stringify({ type: 'timetable', table: empty, jigen: '' }))
    expect(r.slots).toEqual([])
    expect(r.error).toBe('時間割を読み取れませんでした')
  })

  it('jigenが空でもtableが有効ならslotsは返す', () => {
    const r = parseCollectionMessage(JSON.stringify({ type: 'timetable', table: TABLE_MINIMAL, jigen: '' }))
    expect(r.slots).toHaveLength(2)
    expect(r.periodTimes).toBeNull()
    expect(r.error).toBeNull()
  })
})
