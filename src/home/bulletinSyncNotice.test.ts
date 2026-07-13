import { describe, expect, it } from 'vitest'
import { bulletinSyncSkipReason, bulletinSyncSkipMessage } from './bulletinSyncNotice'

describe('bulletinSyncSkipReason', () => {
  it('オンライン・帯外・授業外はスキップなし(null)', () => {
    expect(bulletinSyncSkipReason({ running: false, access: 'ok' })).toBeNull()
  })
  it('授業中(running)はattending', () => {
    expect(bulletinSyncSkipReason({ running: true, access: 'ok' })).toBe('attending')
  })
  it('メンテ帯はmaintenance（授業中でもaccessGate優先＝既存ガード順と同じ）', () => {
    expect(bulletinSyncSkipReason({ running: false, access: 'maintenance' })).toBe('maintenance')
    expect(bulletinSyncSkipReason({ running: true, access: 'maintenance' })).toBe('maintenance')
  })
  it('オフラインはoffline（offline > maintenance > attending）', () => {
    expect(bulletinSyncSkipReason({ running: false, access: 'offline' })).toBe('offline')
    expect(bulletinSyncSkipReason({ running: true, access: 'offline' })).toBe('offline')
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
