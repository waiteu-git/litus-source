import { describe, it, expect } from 'vitest'
import { serializeAutoRegisteredCancelKeys, deserializeAutoRegisteredCancelKeys } from './autoRegisteredCancelsSerialize'

describe('autoRegisteredCancels serialize', () => {
  it('往復できる', () => {
    expect(deserializeAutoRegisteredCancelKeys(serializeAutoRegisteredCancelKeys(['a', 'b']))).toEqual(['a', 'b'])
  })

  it('raw===null（未初期化）は有効な空配列', () => {
    expect(deserializeAutoRegisteredCancelKeys(null)).toEqual([])
  })

  it('壊れたJSON/非配列は null（読めない扱い。[]とは区別する）', () => {
    expect(deserializeAutoRegisteredCancelKeys('{')).toBeNull()
    expect(deserializeAutoRegisteredCancelKeys('{"a":1}')).toBeNull()
    expect(deserializeAutoRegisteredCancelKeys('"a string"')).toBeNull()
  })

  it('文字列要素のみ採用する（部分的なジャンクは個別に落とす）', () => {
    expect(deserializeAutoRegisteredCancelKeys('["a",1,null,"b"]')).toEqual(['a', 'b'])
  })
})
