import { describe, expect, it } from 'vitest'
import {
  KILL_SWITCH_REFRESH_INTERVAL_MS,
  isAppKilled,
  isFeatureKilled,
  isKillSwitchStale,
  parseBuildNumber,
  parseKillSwitchStatus,
} from './killSwitch'

const BUILD = 78

describe('parseKillSwitchStatus', () => {
  it('通常運転のstatus.json（disabled空）をパースできる', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ schemaVersion: 1, disabled: [], message: '' }), BUILD)
    expect(s).toEqual({ disabledAll: false, disabled: [], message: null, title: null })
  })

  it('機能停止の指定を正規化する', () => {
    const s = parseKillSwitchStatus(
      JSON.stringify({ schemaVersion: 1, disabled: ['attendance', 'letus'], message: '一部停止中' }),
      BUILD,
    )
    expect(s).toEqual({ disabledAll: false, disabled: ['attendance', 'letus'], message: '一部停止中', title: null })
  })

  it('title を停止時の見出しとして読む（空/非文字列は null）', () => {
    expect(
      parseKillSwitchStatus(JSON.stringify({ disabled: ['all'], title: '緊急メンテナンス中' }), BUILD)?.title,
    ).toBe('緊急メンテナンス中')
    expect(parseKillSwitchStatus(JSON.stringify({ disabled: [], title: '' }), BUILD)?.title).toBeNull()
    expect(parseKillSwitchStatus(JSON.stringify({ disabled: [], title: 7 }), BUILD)?.title).toBeNull()
  })

  it('all指定はdisabledAllになる', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ schemaVersion: 1, disabled: ['all'], message: '停止' }), BUILD)
    expect(s?.disabledAll).toBe(true)
  })

  it('未知の機能名は無視する（前方互換）', () => {
    const s = parseKillSwitchStatus(
      JSON.stringify({ schemaVersion: 2, disabled: ['newfeature', 'bulletin'], message: '' }),
      BUILD,
    )
    expect(s).toEqual({ disabledAll: false, disabled: ['bulletin'], message: null, title: null })
  })

  it('配列内の非文字列は無視する', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ disabled: [1, null, 'letus'] }), BUILD)
    expect(s?.disabled).toEqual(['letus'])
  })

  it('空文字messageはnull（無し）扱い', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ disabled: [], message: '' }), BUILD)
    expect(s?.message).toBeNull()
  })

  it('非文字列messageはnull扱い', () => {
    const s = parseKillSwitchStatus(JSON.stringify({ disabled: [], message: 42 }), BUILD)
    expect(s?.message).toBeNull()
  })

  it('壊れJSONはnull（取得失敗と同じ扱い）', () => {
    expect(parseKillSwitchStatus('{not json', BUILD)).toBeNull()
  })

  it('HTML誤配信（Pagesの404ページ等）はnull', () => {
    expect(parseKillSwitchStatus('<!doctype html><html></html>', BUILD)).toBeNull()
  })

  it('disabledが配列でなければnull', () => {
    expect(parseKillSwitchStatus(JSON.stringify({ disabled: 'all' }), BUILD)).toBeNull()
    expect(parseKillSwitchStatus(JSON.stringify({ schemaVersion: 1 }), BUILD)).toBeNull()
  })

  it('トップレベルがobjectでなければnull', () => {
    expect(parseKillSwitchStatus(JSON.stringify([]), BUILD)).toBeNull()
    expect(parseKillSwitchStatus(JSON.stringify(null), BUILD)).toBeNull()
    expect(parseKillSwitchStatus(JSON.stringify('all'), BUILD)).toBeNull()
  })
})

describe('parseKillSwitchStatus: versionRules（バージョン別停止）', () => {
  const withRule = (rule: unknown, build: number | null) =>
    parseKillSwitchStatus(JSON.stringify({ schemaVersion: 1, disabled: [], message: '', versionRules: [rule] }), build)

  it('maxBuild以下のビルドにだけ効く（境界含む）', () => {
    const rule = { disabled: ['attendance'], maxBuild: 77 }
    expect(withRule(rule, 77)?.disabled).toEqual(['attendance'])
    expect(withRule(rule, 70)?.disabled).toEqual(['attendance'])
    expect(withRule(rule, 78)?.disabled).toEqual([])
  })

  it('minBuild以上のビルドにだけ効く（境界含む）', () => {
    const rule = { disabled: ['letus'], minBuild: 80 }
    expect(withRule(rule, 80)?.disabled).toEqual(['letus'])
    expect(withRule(rule, 79)?.disabled).toEqual([])
  })

  it('min/max併用は範囲指定になる', () => {
    const rule = { disabled: ['bulletin'], minBuild: 75, maxBuild: 77 }
    expect(withRule(rule, 74)?.disabled).toEqual([])
    expect(withRule(rule, 76)?.disabled).toEqual(['bulletin'])
    expect(withRule(rule, 78)?.disabled).toEqual([])
  })

  it('ルールのallは当該ビルドで全体停止になる', () => {
    const rule = { disabled: ['all'], maxBuild: 77 }
    expect(withRule(rule, 77)?.disabledAll).toBe(true)
    expect(withRule(rule, 78)?.disabledAll).toBe(false)
  })

  it('当たったルールのmessage/titleは全体の文言を上書きする（旧版だけ文言を変えられる）', () => {
    const raw = JSON.stringify({
      disabled: [],
      message: '共通の文言',
      versionRules: [{ disabled: ['attendance'], maxBuild: 77, message: '旧版向けの文言', title: '旧版のみ停止' }],
    })
    const old = parseKillSwitchStatus(raw, 77)
    expect(old?.message).toBe('旧版向けの文言')
    expect(old?.title).toBe('旧版のみ停止')
    const current = parseKillSwitchStatus(raw, 78)
    expect(current?.message).toBe('共通の文言')
    expect(current?.title).toBeNull()
  })

  it('複数ルールは合算・文言は後勝ち', () => {
    const raw = JSON.stringify({
      disabled: [],
      versionRules: [
        { disabled: ['attendance'], maxBuild: 80, message: '先' },
        { disabled: ['letus'], maxBuild: 79, message: '後' },
      ],
    })
    const s = parseKillSwitchStatus(raw, 79)
    expect(s?.disabled).toEqual(['attendance', 'letus'])
    expect(s?.message).toBe('後')
  })

  it('トップレベルdisabledとルールは合算される', () => {
    const raw = JSON.stringify({
      disabled: ['bulletin'],
      versionRules: [{ disabled: ['attendance'], maxBuild: 78 }],
    })
    expect(parseKillSwitchStatus(raw, 78)?.disabled).toEqual(['attendance', 'bulletin'])
  })

  it('buildがnull（Expo Go/dev）のときはルールを適用しない（fail-open）', () => {
    const rule = { disabled: ['all'], maxBuild: 999 }
    expect(withRule(rule, null)?.disabledAll).toBe(false)
  })

  it('壊れたルールは無視し、境界の型が壊れたルールは当たらない側に倒す', () => {
    const raw = JSON.stringify({
      disabled: [],
      versionRules: [
        'broken',
        { maxBuild: 77 }, // disabledなし
        { disabled: ['attendance'], maxBuild: '77' }, // 境界が文字列→当たらない
        { disabled: ['letus'], maxBuild: 78 },
      ],
    })
    expect(parseKillSwitchStatus(raw, 77)?.disabled).toEqual(['letus'])
  })

  it('versionRulesが配列でない・無いときは従来どおり', () => {
    expect(parseKillSwitchStatus(JSON.stringify({ disabled: [], versionRules: 'x' }), BUILD)?.disabled).toEqual([])
    expect(parseKillSwitchStatus(JSON.stringify({ disabled: ['letus'] }), BUILD)?.disabled).toEqual(['letus'])
  })
})

describe('parseBuildNumber', () => {
  it('nativeBuildVersionの文字列/数値をビルド番号にする', () => {
    expect(parseBuildNumber('78')).toBe(78)
    expect(parseBuildNumber(' 78 ')).toBe(78)
    expect(parseBuildNumber(78)).toBe(78)
  })

  it('取れない・非数値・非正はnull', () => {
    expect(parseBuildNumber(null)).toBeNull()
    expect(parseBuildNumber(undefined)).toBeNull()
    expect(parseBuildNumber('')).toBeNull()
    expect(parseBuildNumber('dev')).toBeNull()
    expect(parseBuildNumber('1.0.0')).toBeNull()
    expect(parseBuildNumber(0)).toBeNull()
    expect(parseBuildNumber(-1)).toBeNull()
  })
})

describe('isAppKilled / isFeatureKilled', () => {
  const none = parseKillSwitchStatus(JSON.stringify({ disabled: [] }), BUILD)
  const letusOnly = parseKillSwitchStatus(JSON.stringify({ disabled: ['letus'] }), BUILD)
  const all = parseKillSwitchStatus(JSON.stringify({ disabled: ['all'] }), BUILD)

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
