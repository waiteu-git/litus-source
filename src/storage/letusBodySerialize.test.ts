import { describe, it, expect } from 'vitest'
import {
  serializeLetusBodies,
  deserializeLetusBodies,
  setBodyEntry,
  type LetusBodyMap,
} from './letusBodySerialize'

describe('letusBodySerialize', () => {
  it('round-trip で内容が保たれる', () => {
    const map: LetusBodyMap = {
      'https://letus/mod/assign/view.php?id=1': {
        description: '本文\n2行目',
        attachments: [{ name: 'a.pdf', url: 'https://letus/pluginfile.php/a.pdf' }],
        fetchedAt: '2026-07-12T01:00:00.000Z',
      },
    }
    expect(deserializeLetusBodies(serializeLetusBodies(map))).toEqual(map)
  })

  it('null・壊れJSON・配列は空マップ', () => {
    expect(deserializeLetusBodies(null)).toEqual({})
    expect(deserializeLetusBodies('{bad')).toEqual({})
    expect(deserializeLetusBodies('[]')).toEqual({})
  })

  it('必須フィールド欠落エントリは落とす', () => {
    const raw = JSON.stringify({ u: { attachments: [], fetchedAt: 'x' } }) // description欠落
    expect(deserializeLetusBodies(raw)).toEqual({})
  })

  it('setBodyEntry は fetchedAt を付けて1件差し込む', () => {
    const next = setBodyEntry({}, 'u1', { description: 'd', attachments: [] }, '2026-07-12T02:00:00.000Z')
    expect(next.u1).toEqual({ description: 'd', attachments: [], fetchedAt: '2026-07-12T02:00:00.000Z' })
  })
})
