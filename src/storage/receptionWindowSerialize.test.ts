import { describe, it, expect } from 'vitest'
import { serializeReceptionWindow, deserializeReceptionWindow } from './receptionWindowSerialize'

describe('receptionWindow serialize', () => {
  it('往復する', () => {
    const r = { date: '2026-07-17', window: '10:20〜12:00', courseName: '線形代数1' }
    expect(deserializeReceptionWindow(serializeReceptionWindow(r))).toEqual(r)
  })

  it('科目名なしも往復する', () => {
    const r = { date: '2026-07-17', window: '10:20〜12:00', courseName: null }
    expect(deserializeReceptionWindow(serializeReceptionWindow(r))).toEqual(r)
  })

  it('未保存・壊れ値は null（ホームは授業ベースへ落ちる）', () => {
    expect(deserializeReceptionWindow(null)).toBeNull()
    expect(deserializeReceptionWindow('')).toBeNull()
    expect(deserializeReceptionWindow('{')).toBeNull()
    expect(deserializeReceptionWindow('[]')).toBeNull()
    expect(deserializeReceptionWindow('"x"')).toBeNull()
  })

  it('date か window が欠けた記録は使わない', () => {
    expect(deserializeReceptionWindow('{"window":"10:20〜12:00"}')).toBeNull()
    expect(deserializeReceptionWindow('{"date":"2026-07-17"}')).toBeNull()
    expect(deserializeReceptionWindow('{"date":"","window":"10:20〜12:00"}')).toBeNull()
    expect(deserializeReceptionWindow('{"date":"2026-07-17","window":""}')).toBeNull()
  })

  it('型違いの courseName は null に倒す（捨てずに記録は活かす）', () => {
    expect(deserializeReceptionWindow('{"date":"2026-07-17","window":"10:20〜12:00","courseName":5}')).toEqual({
      date: '2026-07-17',
      window: '10:20〜12:00',
      courseName: null,
    })
  })

  it('未知フィールドは無視する（将来拡張に寛容）', () => {
    expect(deserializeReceptionWindow('{"date":"2026-07-17","window":"10:20〜12:00","x":1}')).toEqual({
      date: '2026-07-17',
      window: '10:20〜12:00',
      courseName: null,
    })
  })
})
