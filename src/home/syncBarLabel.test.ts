import { describe, expect, it } from 'vitest'
import { healthWarn, syncBarSkipText, syncBarView, syncChipA11yLabel, syncHeaderView, type SyncBarInput } from './syncBarLabel'
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

describe('syncChipA11yLabel（E0 A8・§9-2）', () => {
  it('承認済みの文言どおり', () => {
    expect(syncChipA11yLabel({ ...base, lastSyncAt: now.getTime() - 3 * 60_000 }, now)).toBe('同期、3分前に同期')
    expect(syncChipA11yLabel({ ...base, bulletinBusy: true }, now)).toBe('同期中')
    expect(syncChipA11yLabel({ ...base, assignmentBusy: true }, now)).toBe('課題を同期中')
    expect(syncChipA11yLabel({ ...base, skip: { feature: 'class', reason: 'offline' } }, now)).toBe(
      '同期、オフライン・接続後に同期できます',
    )
    expect(syncChipA11yLabel({ ...base, letusHealth: h('not_logged_in') }, now)).toBe(
      '同期、要再同期、最新を取得できていない可能性・タップで再同期',
    )
    expect(syncChipA11yLabel({ ...base, skip: { feature: 'class', reason: 'maintenance' } }, now)).toBe(
      '同期、メンテ中、CLASSメンテナンス中・終了後に同期',
    )
    expect(syncChipA11yLabel(base, now)).toBe('同期、未同期')
  })

  const reasons = ['offline', 'maintenance', 'attending', 'stopped', 'demo'] as const
  const features = ['class', 'letus'] as const
  const inputs: SyncBarInput[] = [
    { ...base, bulletinBusy: true },
    { ...base, assignmentBusy: true },
    ...reasons.flatMap((reason) => features.map((feature) => ({ ...base, skip: { feature, reason } }))),
    { ...base, bulletinHealth: h('structure_drift') },
    { ...base, letusHealth: h('not_logged_in') },
    base,
    { ...base, lastSyncAt: now.getTime() - 30_000 },
    { ...base, lastSyncAt: now.getTime() - 3 * 60_000 },
    { ...base, lastSyncAt: now.getTime() - 2 * 60 * 60_000 },
    { ...base, lastSyncAt: new Date(2026, 6, 13, 9, 5).getTime() },
  ]

  it('陽性: 全 kind・全スキップ理由・全 feature で、画面の短縮形（syncHeaderView）を含む（音声コントロール＝WCAG 2.5.3）', () => {
    for (const i of inputs) expect(syncChipA11yLabel(i, now)).toContain(syncHeaderView(i, now).text)
  })
  it('陰性: どの入力でも「同期」だけを返さず、末尾に「…」を残さない', () => {
    for (const i of inputs) {
      const label = syncChipA11yLabel(i, now)
      expect(label).not.toBe('同期')
      expect(label.endsWith('…')).toBe(false)
    }
  })
  it('入力が kind を網羅している（テストの形骸化防止）', () => {
    const kinds = new Set(inputs.map((i) => syncHeaderView(i, now).kind))
    expect([...kinds].sort()).toEqual(['busyQuiet', 'busySpinner', 'fresh', 'skip', 'warn'])
  })
})
