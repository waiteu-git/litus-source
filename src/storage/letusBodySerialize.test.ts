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

  it('fetchedAt 欠落エントリは落とす', () => {
    const raw = JSON.stringify({ u: { description: 'd', attachments: [] } }) // fetchedAt欠落
    expect(deserializeLetusBodies(raw)).toEqual({})
  })

  it('不正な attachments のエントリは丸ごと落とす', () => {
    // attachments が配列でない
    const notArray = JSON.stringify({ u: { description: 'd', attachments: 'nope', fetchedAt: 't' } })
    expect(deserializeLetusBodies(notArray)).toEqual({})
    // attachment 要素に文字列 url が無い
    const badElem = JSON.stringify({ u: { description: 'd', attachments: [{ name: 'a' }], fetchedAt: 't' } })
    expect(deserializeLetusBodies(badElem)).toEqual({})
  })

  it('setBodyEntry は fetchedAt を付けて1件差し込む', () => {
    const next = setBodyEntry({}, 'u1', { description: 'd', attachments: [] }, '2026-07-12T02:00:00.000Z')
    expect(next.u1).toEqual({ description: 'd', attachments: [], fetchedAt: '2026-07-12T02:00:00.000Z' })
  })

  it('setBodyEntry は入力マップを変更せず新しい参照を返す', () => {
    const before: LetusBodyMap = { existing: { description: 'x', attachments: [], fetchedAt: 't0' } }
    const after = setBodyEntry(before, 'u2', { description: 'd', attachments: [] }, 't1')
    // 入力は不変
    expect(Object.keys(before)).toEqual(['existing'])
    // 別参照
    expect(after).not.toBe(before)
    // 既存分と新規分の両方を含む
    expect(after.existing).toEqual({ description: 'x', attachments: [], fetchedAt: 't0' })
    expect(after.u2).toEqual({ description: 'd', attachments: [], fetchedAt: 't1' })
  })
})
