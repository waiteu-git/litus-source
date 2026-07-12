import { describe, expect, it } from 'vitest'
import {
  KILL_SWITCH_REFRESH_INTERVAL_MS,
  isAppKilled,
  isFeatureKilled,
  isKillSwitchStale,
  parseKillSwitchStatus,
} from './killSwitch'

describe('parseKillSwitchStatus', () => {
  it('通常運転のstatus.json（disabled空）をパースできる', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ schemaVersion: 1, disabled: [], message: '' }))
    expect(s).toEqual({ disabledAll: false, disabled: [], message: null })
  })

  it('機能停止の指定を正規化する', () => {
    const s = parseKillSwitchStatus(
      JSON.stringify({ schemaVersion: 1, disabled: ['attendance', 'letus'], message: '一部停止中' }),
    )
    expect(s).toEqual({ disabledAll: false, disabled: ['attendance', 'letus'], message: '一部停止中' })
  })

  it('all指定はdisabledAllになる', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ schemaVersion: 1, disabled: ['all'], message: '停止' }))
    expect(s?.disabledAll).toBe(true)
  })

  it('未知の機能名は無視する（前方互換）', () => {
    const s = parseKillSwitchStatus(
      JSON.stringify({ schemaVersion: 2, disabled: ['newfeature', 'bulletin'], message: '' }),
    )
    expect(s).toEqual({ disabledAll: false, disabled: ['bulletin'], message: null })
  })

  it('配列内の非文字列は無視する', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ disabled: [1, null, 'letus'] }))
    expect(s?.disabled).toEqual(['letus'])
  })

  it('空文字messageはnull（無し）扱い', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ disabled: [], message: '' }))
    expect(s?.message).toBeNull()
  })

  it('非文字列messageはnull扱い', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ disabled: [], message: 42 }))
    expect(s?.message).toBeNull()
  })

  it('壊れJSONはnull（取得失敗と同じ扱い）', () => {
    expect(parseKillSwitchStatus('{not json')).toBeNull()
  })

  it('HTML誤配信（Pagesの404ページ等）はnull', () => {
    expect(parseKillSwitchStatus('<!doctype html><html></html>')).toBeNull()
  })

  it('disabledが配列でなければnull', () => {
    expect(parseKillSwitchStatus(JSON.stringify({ disabled: 'all' }))).toBeNull()
    expect(parseKillSwitchStatus(JSON.stringify({ schemaVersion: 1 }))).toBeNull()
  })

  it('トップレベルがobjectでなければnull', () => {
    expect(parseKillSwitchStatus(JSON.stringify([]))).toBeNull()
    expect(parseKillSwitchStatus(JSON.stringify(null))).toBeNull()
    expect(parseKillSwitchStatus(JSON.stringify('all'))).toBeNull()
  })
})

describe('isAppKilled / isFeatureKilled', () => {
  const none = parseKillSwitchStatus(JSON.stringify({ disabled: [] }))
  const letusOnly = parseKillSwitchStatus(JSON.stringify({ disabled: ['letus'] }))
  const all = parseKillSwitchStatus(JSON.stringify({ disabled: ['all'] }))

  it('status未取得（null）はfail-openで全て許可', () => {
    expect(isAppKilled(null)).toBe(false)
    expect(isFeatureKilled(null, 'attendance')).toBe(false)
  })

  it('disabled空は全て許可', () => {
    expect(isAppKilled(none)).toBe(false)
    expect(isFeatureKilled(none, 'letus')).toBe(false)
  })

  it('機能指定は当該機能のみ停止', () => {
    expect(isAppKilled(letusOnly)).toBe(false)
    expect(isFeatureKilled(letusOnly, 'letus')).toBe(true)
    expect(isFeatureKilled(letusOnly, 'bulletin')).toBe(false)
  })

  it('allは全機能停止かつアプリ全体停止', () => {
    expect(isAppKilled(all)).toBe(true)
    expect(isFeatureKilled(all, 'attendance')).toBe(true)
    expect(isFeatureKilled(all, 'bulletin')).toBe(true)
    expect(isFeatureKilled(all, 'letus')).toBe(true)
  })
})

describe('isKillSwitchStale', () => {
  it('前回取得から間隔未満ならstaleでない（復帰ごとの再取得スロットル）', () => {
    expect(isKillSwitchStale(10_000, 10_000 + KILL_SWITCH_REFRESH_INTERVAL_MS - 1)).toBe(false)
  })

  it('前回取得から間隔以上ならstale', () => {
    expect(isKillSwitchStale(10_000, 10_000 + KILL_SWITCH_REFRESH_INTERVAL_MS)).toBe(true)
  })

  it('未取得（0）は常にstale', () => {
    expect(isKillSwitchStale(0, 1)).toBe(true)
  })
})
