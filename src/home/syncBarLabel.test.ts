import { describe, expect, it } from 'vitest'
import { healthWarn, syncBarSkipText, syncBarView, syncHeaderView, type SyncBarInput } from './syncBarLabel'
import type { StoredHealth } from '../storage/collectionHealthSerialize'

const now = new Date(2026, 6, 14, 12, 0)
const base: SyncBarInput = {
  bulletinBusy: false,
  assignmentBusy: false,
  skip: null,
  bulletinHealth: null,
  letusHealth: null,
  lastSyncAt: null,
}
const h = (status: StoredHealth['health']['status']): StoredHealth =>
  ({ health: status === 'ok' ? { status: 'ok', count: 1 } : { status }, at: 1 }) as StoredHealth

describe('syncBarView', () => {
  it('掲示同期中はスピナー付きbusy（最優先）', () => {
    expect(syncBarView({ ...base, bulletinBusy: true, assignmentBusy: true }, now).kind).toBe('busySpinner')
  })
  it('課題同期中は文言のみbusy', () => {
    expect(syncBarView({ ...base, assignmentBusy: true }, now)).toEqual({
      kind: 'busyQuiet',
      text: '課題を同期中…',
    })
  })
  it('スキップ理由は課題同期中より優先（掲示スキップ→課題連鎖でも理由が見える）', () => {
    const v = syncBarView({ ...base, assignmentBusy: true, skip: { feature: 'class', reason: 'attending' } }, now)
    expect(v.kind).toBe('skip')
    expect(v.text).toContain('授業中')
  })
  it('スキップ理由はヘルス注意より優先', () => {
    const v = syncBarView(
      { ...base, skip: { feature: 'class', reason: 'attending' }, bulletinHealth: h('structure_drift') },
      now,
    )
    expect(v.kind).toBe('skip')
    expect(v.text).toContain('授業中')
  })
  it('ヘルス注意（drift/未ログイン）はwarn', () => {
    expect(syncBarView({ ...base, letusHealth: h('not_logged_in') }, now).kind).toBe('warn')
  })
  it('平常は鮮度表示（未同期含む）', () => {
    expect(syncBarView(base, now)).toEqual({ kind: 'fresh', text: '未同期' })
    expect(syncBarView({ ...base, lastSyncAt: now.getTime() - 5 * 60_000 }, now).text).toBe('5分前に同期')
  })
})

describe('syncHeaderView', () => {
  it('掲示・課題どちらの同期中も「同期中」に畳む', () => {
    expect(syncHeaderView({ ...base, bulletinBusy: true }, now)).toEqual({ kind: 'busySpinner', text: '同期中' })
    expect(syncHeaderView({ ...base, assignmentBusy: true }, now)).toEqual({ kind: 'busyQuiet', text: '同期中' })
  })
  it('スキップは極短形（詳細は syncSkipMessage が担う）', () => {
    expect(syncHeaderView({ ...base, skip: { feature: 'class', reason: 'attending' } }, now).text).toBe('授業中')
    expect(syncHeaderView({ ...base, skip: { feature: 'letus', reason: 'maintenance' } }, now).text).toBe('メンテ中')
    expect(syncHeaderView({ ...base, skip: { feature: 'class', reason: 'offline' } }, now).text).toBe('オフライン')
  })
  it('ヘルス注意は「要再同期」', () => {
    expect(syncHeaderView({ ...base, letusHealth: h('not_logged_in') }, now)).toEqual({ kind: 'warn', text: '要再同期' })
  })
  it('平常は短縮鮮度（suffixなし・未同期含む）', () => {
    expect(syncHeaderView(base, now)).toEqual({ kind: 'fresh', text: '未同期' })
    expect(syncHeaderView({ ...base, lastSyncAt: now.getTime() - 5 * 60_000 }, now).text).toBe('5分前')
  })
  it('優先順位は syncBarView と一致（スキップ＞課題同期中）', () => {
    const v = syncHeaderView({ ...base, assignmentBusy: true, skip: { feature: 'class', reason: 'attending' } }, now)
    expect(v.kind).toBe('skip')
    expect(v.text).toBe('授業中')
  })
})

describe('healthWarn', () => {
  it('ok/empty_valid/maintenance/blocked/未保存は注意にしない', () => {
    expect(healthWarn(h('ok'), h('empty_valid'))).toBe(false)
    expect(healthWarn(h('maintenance'), h('blocked'))).toBe(false)
    expect(healthWarn(null, null)).toBe(false)
  })
  it('structure_drift / not_logged_in は注意', () => {
    expect(healthWarn(h('structure_drift'), null)).toBe(true)
    expect(healthWarn(null, h('not_logged_in'))).toBe(true)
  })
})

describe('syncBarSkipText', () => {
  it('メンテはシステム名を出し分ける', () => {
    expect(syncBarSkipText('class', 'maintenance')).toContain('CLASS')
    expect(syncBarSkipText('letus', 'maintenance')).toContain('LETUS')
  })
  it('kill switch停止中は一時停止の文言（feature単位で出し分け＝課題同期中の表示と矛盾させない）', () => {
    expect(syncBarSkipText('class', 'stopped')).toContain('掲示の同期は一時停止')
    expect(syncBarSkipText('letus', 'stopped')).toContain('課題の同期は一時停止')
  })
})
