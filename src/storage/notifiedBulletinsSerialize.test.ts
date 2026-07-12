import { describe, it, expect } from 'vitest'
import { serializeNotifiedIds, deserializeNotifiedIds } from './notifiedBulletinsSerialize'

describe('notifiedBulletins serialize', () => {
  it('往復できる', () => {
    expect(deserializeNotifiedIds(serializeNotifiedIds(['a', 'b']))).toEqual(['a', 'b'])
  })

  it('null/壊れJSON/非配列は空配列', () => {
    expect(deserializeNotifiedIds(null)).toEqual([])
    expect(deserializeNotifiedIds('{')).toEqual([])
    expect(deserializeNotifiedIds('{"a":1}')).toEqual([])
  })

  it('文字列要素のみ採用する', () => {
    expect(deserializeNotifiedIds('["a",1,null,"b"]')).toEqual(['a', 'b'])
  })
})
