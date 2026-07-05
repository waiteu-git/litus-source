import { serializeAttendanceSettings, deserializeAttendanceSettings } from './attendanceSettingsSerialize'

describe('attendanceSettings serialize/deserialize', () => {
  it('往復で保持する', () => {
    const s = { '9973339': false, '9973415': true }
    expect(deserializeAttendanceSettings(serializeAttendanceSettings(s))).toEqual(s)
  })

  it('null・空・壊れJSON・配列・非boolean値は空オブジェクトへ丸める', () => {
    expect(deserializeAttendanceSettings(null)).toEqual({})
    expect(deserializeAttendanceSettings('')).toEqual({})
    expect(deserializeAttendanceSettings('not-json')).toEqual({})
    expect(deserializeAttendanceSettings('[1,2]')).toEqual({})
    expect(deserializeAttendanceSettings(JSON.stringify({ a: 'x', b: 1, c: true }))).toEqual({ c: true })
  })
})
