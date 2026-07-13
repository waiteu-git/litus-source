import { describe, expect, it } from 'vitest'
import { bulletinSyncSkipReason, bulletinSyncSkipMessage } from './bulletinSyncNotice'
import type { AccessReason } from '../health/accessGate'

describe('bulletinSyncSkipReason', () => {
  it('許可(allowed)・授業外はスキップなし(null)', () => {
    expect(bulletinSyncSkipReason({ running: false, access: { allowed: true, reason: 'ok' } })).toBeNull()
  })
  it('許可・授業中(running)はattending', () => {
    expect(bulletinSyncSkipReason({ running: true, access: { allowed: true, reason: 'ok' } })).toBe('attending')
  })
  it('不許可・メンテ帯はmaintenance（授業中でもゲート優先＝既存ガード順と同じ）', () => {
    expect(bulletinSyncSkipReason({ running: false, access: { allowed: false, reason: 'maintenance' } })).toBe('maintenance')
    expect(bulletinSyncSkipReason({ running: true, access: { allowed: false, reason: 'maintenance' } })).toBe('maintenance')
  })
  it('不許可・オフラインはoffline（offline > maintenance > attending）', () => {
    expect(bulletinSyncSkipReason({ running: false, access: { allowed: false, reason: 'offline' } })).toBe('offline')
    expect(bulletinSyncSkipReason({ running: true, access: { allowed: false, reason: 'offline' } })).toBe('offline')
  })
  it('ゲート判定は allowed を単一の真実とする＝将来 AccessReason に不許可理由が増えても収集は止まりフィードバックも出る（null にしない）', () => {
    // accessGate に将来 'lockout' 等が増えた場合を模した前方互換の保証。
    // allowed:false を無視して reason だけ見ていると null に落ち、収集ガードが静かに外れて再発する。
    const future = { allowed: false, reason: 'lockout' as AccessReason }
    expect(bulletinSyncSkipReason({ running: false, access: future })).not.toBeNull()
  })
})

describe('bulletinSyncSkipMessage', () => {
  it('attending: 授業中の理由と再取得の見込みを伝える', () => {
    expect(bulletinSyncSkipMessage('attending')).toBe('授業中のため取得を控えています。授業後に取得できます。')
  })
  it('maintenance: CLASSメンテ帯の時間を含めて伝える', () => {
    expect(bulletinSyncSkipMessage('maintenance')).toBe('CLASSはメンテナンス中です（毎日2:00–4:00）。終了後に取得できます。')
  })
  it('offline: オフラインである旨を伝える', () => {
    expect(bulletinSyncSkipMessage('offline')).toBe('オフラインのため取得できません。接続後にもう一度お試しください。')
  })
})
