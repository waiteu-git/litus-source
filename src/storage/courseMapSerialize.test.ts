import { serializeCourseMap, deserializeCourseMap } from './courseMapSerialize'

describe('courseMap serialize/deserialize', () => {
  it('往復で保持する', () => {
    const map = { '9973339': { name: 'A (9973339)', url: 'u', codes: ['9973339'] } }
    expect(deserializeCourseMap(serializeCourseMap(map))).toEqual(map)
  })
  it('null/壊れJSON/配列/不正エントリは空へ丸める', () => {
    expect(deserializeCourseMap(null)).toEqual({})
    expect(deserializeCourseMap('not-json')).toEqual({})
    expect(deserializeCourseMap('[1]')).toEqual({})
    expect(deserializeCourseMap(JSON.stringify({ a: { name: 'x' } }))).toEqual({})
  })
})
