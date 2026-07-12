import { describe, it, expect } from 'vitest'
import {
  serializeBulletinNotifySettings,
  deserializeBulletinNotifySettings,
} from './bulletinNotifySettingsSerialize'

describe('bulletinNotifySettings serialize', () => {
  it('往復できる', () => {
    const s = { enabled: false, mode: 'importantOnly' as const }
    expect(deserializeBulletinNotifySettings(serializeBulletinNotifySettings(s))).toEqual(s)
  })

  it('null/壊れ値は既定（enabled:true, mode:all）', () => {
    expect(deserializeBulletinNotifySettings(null)).toEqual({ enabled: true, mode: 'all' })
    expect(deserializeBulletinNotifySettings('{')).toEqual({ enabled: true, mode: 'all' })
    expect(deserializeBulletinNotifySettings('[]')).toEqual({ enabled: true, mode: 'all' })
  })

  it('未知modeは all に倒す・未知フィールドは無視（将来拡張に寛容）', () => {
    expect(deserializeBulletinNotifySettings('{"enabled":true,"mode":"categories","x":9}')).toEqual({
      enabled: true,
      mode: 'all',
    })
  })

  it('enabled欠落は既定true', () => {
    expect(deserializeBulletinNotifySettings('{"mode":"importantOnly"}')).toEqual({
      enabled: true,
      mode: 'importantOnly',
    })
  })
})
