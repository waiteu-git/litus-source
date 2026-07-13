import { describe, expect, it } from 'vitest'
import { syncSkipReason, syncSkipMessage } from './syncSkipNotice'
import type { AccessReason } from './accessGate'

describe('syncSkipReason', () => {
  it('許可(allowed)・授業外はスキップなし(null)', () => {
    expect(syncSkipReason({ access: { allowed: true, reason: 'ok' } })).toBeNull()
  })
  it('許可・running=true は attending', () => {
    expect(syncSkipReason({ access: { allowed: true, reason: 'ok' }, running: true })).toBe('attending')
  })
  it('running を渡さない画面(LETUS等)は attending が出ない', () => {
    expect(syncSkipReason({ access: { allowed: true, reason: 'ok' } })).toBeNull()
    expect(syncSkipReason({ access: { allowed: true, reason: 'ok' }, running: false })).toBeNull()
  })
  it('不許可・メンテ帯は maintenance（running 有無に依らずゲート優先）', () => {
    expect(syncSkipReason({ access: { allowed: false, reason: 'maintenance' } })).toBe('maintenance')
    expect(syncSkipReason({ access: { allowed: false, reason: 'maintenance' }, running: true })).toBe('maintenance')
  })
  it('不許可・オフラインは offline（offline > maintenance > attending）', () => {
    expect(syncSkipReason({ access: { allowed: false, reason: 'offline' } })).toBe('offline')
    expect(syncSkipReason({ access: { allowed: false, reason: 'offline' }, running: true })).toBe('offline')
  })
  it('allowed を単一の真実とする＝将来 AccessReason に不許可理由が増えても収集は止まり非nullを返す', () => {
    const future = { allowed: false, reason: 'lockout' as AccessReason }
    expect(syncSkipReason({ access: future })).not.toBeNull()
  })
})

describe('syncSkipMessage', () => {
  it('CLASS の maintenance は 2:00–4:00 を含む', () => {
    expect(syncSkipMessage('class', 'maintenance')).toBe('CLASSはメンテナンス中です（毎日2:00–4:00）。終了後に取得できます。')
  })
  it('LETUS の maintenance は 4:00–5:30 を含む', () => {
    expect(syncSkipMessage('letus', 'maintenance')).toBe('LETUSはメンテナンス中です（毎日4:00–5:30）。終了後に取得できます。')
  })
  it('offline は source に依らず固定文言', () => {
    expect(syncSkipMessage('class', 'offline')).toBe('オフラインのため取得できません。接続後にもう一度お試しください。')
    expect(syncSkipMessage('letus', 'offline')).toBe('オフラインのため取得できません。接続後にもう一度お試しください。')
  })
  it('attending は固定文言', () => {
    expect(syncSkipMessage('class', 'attending')).toBe('授業中のため取得を控えています。授業後に取得できます。')
  })
})
