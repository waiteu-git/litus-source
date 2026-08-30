import { parseAcademicCalendar } from '../health/academicCalendar'
import { describe, expect, it } from 'vitest'
import { parseSemesterHeading, currentSemester, pickCurrentSemester } from './semester'

describe('parseSemesterHeading', () => {
  it('実測の見出し「2026年度 前期」を読む', () => {
    expect(parseSemesterHeading('2026年度 前期')).toEqual({ year: 2026, term: '前期' })
    expect(parseSemesterHeading('2026年度 後期')).toEqual({ year: 2026, term: '後期' })
  })
  it('空白ゆれを吸収する', () => {
    expect(parseSemesterHeading('2026年度　後期')?.term).toBe('後期')
    expect(parseSemesterHeading('2026年度後期')?.term).toBe('後期')
  })
  it('読めないものは null（絞り込みをしない側へ倒すため）', () => {
    for (const v of [null, undefined, '', '時間割', '2026年度', '前期']) {
      expect(parseSemesterHeading(v as string)).toBeNull()
    }
  })
})

describe('currentSemester', () => {
  // 境界は termBounds が正典（前期4/1〜8/7・後期9/1〜翌2/7）。ここは同じ境界に乗ることの確認。
  it('学期中はその学期を返す', () => {
    expect(currentSemester(new Date(2026, 4 - 1, 10))).toBe('前期')
    expect(currentSemester(new Date(2026, 7 - 1, 20))).toBe('前期')
    expect(currentSemester(new Date(2026, 9 - 1, 11))).toBe('後期')
    expect(currentSemester(new Date(2026, 12 - 1, 1))).toBe('後期')
    expect(currentSemester(new Date(2027, 1 - 1, 20))).toBe('後期') // 年跨ぎ
  })
  it('🔴9/1以降は後期（termBoundsが開始を早い側へ倒しているのに合わせる）', () => {
    expect(currentSemester(new Date(2026, 9 - 1, 1))).toBe('後期')
  })
  it('学期の外（夏休み等）は null＝絞り込まない', () => {
    expect(currentSemester(new Date(2026, 8 - 1, 20))).toBeNull()
  })
})

describe('pickCurrentSemester', () => {
  const spring = { label: '2026年度 前期', slots: [] }
  const fall = { label: '2026年度 後期', slots: [] }

  it('後期中は後期だけを残す', () => {
    expect(pickCurrentSemester([spring, fall], new Date(2026, 9 - 1, 11))).toEqual([fall])
  })
  it('前期中は前期だけを残す', () => {
    expect(pickCurrentSemester([spring, fall], new Date(2026, 5 - 1, 1))).toEqual([spring])
  })

  // 🔴以下はすべて「取れているものを捨てない」＝今日と同じ挙動へ退避する分岐。
  it('1枚以下ならそのまま（通常経路を変えない）', () => {
    expect(pickCurrentSemester([spring], new Date(2026, 9 - 1, 11))).toEqual([spring])
    expect(pickCurrentSemester([], new Date(2026, 9 - 1, 11))).toEqual([])
  })
  it('🔴学期の外でも最新1つに絞る（両方残すと後期科目に出席アラームが鳴る）', () => {
    expect(pickCurrentSemester([spring, fall], new Date(2026, 8 - 1, 20))).toEqual([fall])
  })
  it('見出しが1つも読めないなら絞らない（旧い保存データ・書式変更）', () => {
    const all = [{ label: null, slots: [] }, { label: '時間割2', slots: [] }]
    expect(pickCurrentSemester(all, new Date(2026, 9 - 1, 11))).toEqual(all)
  })
  it('🔴一致する学期が無いときは最新1つ（後期の表がまだ無い時に前期を捨てない）', () => {
    const onlySpring = [{ label: '2025年度 前期', slots: [] }, spring]
    expect(pickCurrentSemester(onlySpring, new Date(2026, 9 - 1, 11))).toEqual([spring])
  })
  it('年度が新しい方を優先する', () => {
    const mixed = [{ label: '2026年度 後期', slots: [] }, { label: '2027年度 前期', slots: [] }]
    expect(pickCurrentSemester(mixed, new Date(2026, 8 - 1, 20))).toEqual([mixed[1]])
  })
})

describe('🔴 表示中の週で学期が切り替わる（2026-08-28 ユーザー要望・遠隔暦つき）', () => {
  const calendar = parseAcademicCalendar({
    terms: [
      { id: 'spring', start: '2026-04-13', end: '2026-08-06' },
      { id: 'fall', start: '2026-09-11', end: '2027-01-25' },
    ],
  })
  const both = [{ label: '2026年度 前期' }, { label: '2026年度 後期' }]
  const at = (ymd: string) => new Date(`${ymd}T09:00:00+09:00`)
  const pick = (ymd: string) => pickCurrentSemester(both, at(ymd), calendar)[0].label

  it('学期の中を見ているときはその学期', () => {
    expect(pick('2026-05-11')).toBe('2026年度 前期')
    expect(pick('2026-10-05')).toBe('2026年度 後期')
  })

  it('🔴 学期間は前後の中点で切り替わる＝境界を固定値で持たない', () => {
    // 8/6 と 9/11 の中点は 8/24。ユーザーの体感「8/26あたり」とほぼ一致し、毎年追随する。
    expect(pick('2026-08-17')).toBe('2026年度 前期')
    expect(pick('2026-08-31')).toBe('2026年度 後期')
  })

  it('スワイプで前後に動かすと学期が変わる（同じデータ・日付だけ違う）', () => {
    expect(pick('2026-07-06')).toBe('2026年度 前期')
    expect(pick('2026-09-14')).toBe('2026年度 後期')
  })

  it('🔴 移行の世界: 1学期しか保存されていない端末はそのまま返す（無害に縮退）', () => {
    const only = [{ label: '2026年度 前期' }]
    expect(pickCurrentSemester(only, at('2026-10-05'), calendar)).toEqual(only)
  })

  it('🔴 暦が無ければ従来どおり（最新の学期を1つ）＝スワイプ連動は効かないが壊れない', () => {
    expect(pickCurrentSemester(both, at('2026-05-11'), null)[0].label).toBe('2026年度 前期')
    expect(pickCurrentSemester(both, at('2026-08-31'), null)[0].label).toBe('2026年度 後期')
  })
})
