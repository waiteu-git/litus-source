import { describe, it, expect } from 'vitest'
import { serializeFavorites, deserializeFavorites, toggleFavorite } from './favoritesSerialize'

describe('favorites serialize', () => {
  it('round-trip', () => {
    expect(deserializeFavorites(serializeFavorites(['a', 'b']))).toEqual(['a', 'b'])
  })
  it('nullは空配列', () => {
    expect(deserializeFavorites(null)).toEqual([])
  })
  it('壊れたJSONは空配列', () => {
    expect(deserializeFavorites('{not json')).toEqual([])
  })
  it('重複は除去', () => {
    expect(deserializeFavorites(JSON.stringify(['a', 'a', 'b']))).toEqual(['a', 'b'])
  })
  it('文字列以外を除外', () => {
    expect(deserializeFavorites(JSON.stringify(['a', 1, null, 'b']))).toEqual(['a', 'b'])
  })
})

describe('toggleFavorite', () => {
  it('無ければ追加', () => { expect(toggleFavorite(['a'], 'b')).toEqual(['a', 'b']) })
  it('あれば除去', () => { expect(toggleFavorite(['a', 'b'], 'a')).toEqual(['b']) })
})
