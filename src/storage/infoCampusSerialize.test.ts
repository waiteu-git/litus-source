import { describe, it, expect } from 'vitest'
import { deserializeInfoCampus, serializeInfoCampus } from './infoCampusSerialize'

describe('infoCampusSerialize', () => {
  it('各CampusIdを往復できる', () => {
    for (const v of ['katsushika', 'kagurazaka', 'noda'] as const) {
      expect(deserializeInfoCampus(serializeInfoCampus(v))).toBe(v)
    }
  })

  it('nullは空文字に直列化しnullに戻る', () => {
    expect(deserializeInfoCampus(serializeInfoCampus(null))).toBeNull()
  })

  it('未知の文字列・不正入力はnullに落ちる', () => {
    expect(deserializeInfoCampus('setagaya')).toBeNull()
    expect(deserializeInfoCampus('')).toBeNull()
    expect(deserializeInfoCampus(null)).toBeNull()
    expect(deserializeInfoCampus('{"id":1}')).toBeNull()
  })
})
