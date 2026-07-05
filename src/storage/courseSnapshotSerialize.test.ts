import { serializeCourseSnapshots, deserializeCourseSnapshots } from './courseSnapshotSerialize'

describe('courseSnapshots serialize/deserialize', () => {
  it('往復で保持する', () => {
    const m = {
      u1: { activities: [{ title: 'a', url: 'x' }], collectedAt: '2026-07-05T00:00:00.000Z', added: [], removed: [] },
    }
    expect(deserializeCourseSnapshots(serializeCourseSnapshots(m))).toEqual(m)
  })
  it('null/壊れJSON/配列/不正エントリは空へ丸める', () => {
    expect(deserializeCourseSnapshots(null)).toEqual({})
    expect(deserializeCourseSnapshots('not-json')).toEqual({})
    expect(deserializeCourseSnapshots('[1]')).toEqual({})
    expect(deserializeCourseSnapshots(JSON.stringify({ u1: { activities: 'x' } }))).toEqual({})
  })
})
