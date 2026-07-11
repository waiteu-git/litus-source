import { describe, expect, it } from 'vitest'
import {
  deserializeCollectionHealth,
  serializeCollectionHealth,
  type CollectionHealthMap,
} from './collectionHealthSerialize'

describe('collectionHealthSerialize', () => {
  it('roundtrip（全状態）', () => {
    const m: CollectionHealthMap = {
      bulletin: { health: { status: 'ok', count: 143 }, at: 1752200000000 },
      timetable: { health: { status: 'structure_drift' }, at: 1752200000001 },
      letusAssignments: { health: { status: 'empty_valid' }, at: 1752200000002 },
    }
    expect(deserializeCollectionHealth(serializeCollectionHealth(m))).toEqual(m)
  })

  it('null / 壊れJSON / 非オブジェクト / 配列 は {}', () => {
    expect(deserializeCollectionHealth(null)).toEqual({})
    expect(deserializeCollectionHealth('{oops')).toEqual({})
    expect(deserializeCollectionHealth('"str"')).toEqual({})
    expect(deserializeCollectionHealth('[1]')).toEqual({})
  })

  it('未知のid・未知のstatus・型不正エントリは捨て、正しいものだけ残す', () => {
    const raw = JSON.stringify({
      bulletin: { health: { status: 'maintenance' }, at: 100 },
      unknownId: { health: { status: 'ok', count: 1 }, at: 100 },
      timetable: { health: { status: 'weird' }, at: 100 },
      letusAssignments: { health: { status: 'ok' }, at: 100 }, // okなのにcount欠落→捨てる
    })
    expect(deserializeCollectionHealth(raw)).toEqual({
      bulletin: { health: { status: 'maintenance' }, at: 100 },
    })
  })

  it('at が数値でないエントリは捨てる', () => {
    const raw = JSON.stringify({ bulletin: { health: { status: 'blocked' }, at: 'now' } })
    expect(deserializeCollectionHealth(raw)).toEqual({})
  })

  it('ok以外のstatusに紛れ込んだ余分なフィールドは落とす', () => {
    const raw = JSON.stringify({ bulletin: { health: { status: 'blocked', count: 5 }, at: 100 } })
    expect(deserializeCollectionHealth(raw)).toEqual({
      bulletin: { health: { status: 'blocked' }, at: 100 },
    })
  })
})
