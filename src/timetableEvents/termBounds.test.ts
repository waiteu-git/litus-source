import { describe, it, expect } from 'vitest'
import { deriveTermBounds, academicTermRange } from './termBounds'

const WED = new Date(2026, 6, 15) // 2026-07-15 水（現在週offset=0・既定週月曜=7/13）

const md = (d: Date) => [d.getMonth() + 1, d.getDate()]

describe('academicTermRange', () => {
  it('前期は4/1〜8/7（定期試験ぶんを含む）', () => {
    const t = academicTermRange(new Date(2026, 4, 20))!
    expect(md(t.start)).toEqual([4, 1])
    expect(md(t.lastDay)).toEqual([8, 7])
    expect(t.start.getFullYear()).toBe(2026)
    expect(t.lastDay.getFullYear()).toBe(2026)
  })

  it('後期は9/16〜翌2/7（年跨ぎ）', () => {
    const t = academicTermRange(new Date(2026, 10, 5))!
    expect([t.start.getFullYear(), ...md(t.start)]).toEqual([2026, 9, 16])
    expect([t.lastDay.getFullYear(), ...md(t.lastDay)]).toEqual([2027, 2, 7])
  })

  it('年明け（1月）も前年度の後期として解決する', () => {
    const t = academicTermRange(new Date(2027, 0, 20))!
    expect([t.start.getFullYear(), ...md(t.start)]).toEqual([2026, 9, 16])
    expect([t.lastDay.getFullYear(), ...md(t.lastDay)]).toEqual([2027, 2, 7])
  })

  it('夏休み・春休みは授業期間外（null）', () => {
    expect(academicTermRange(new Date(2026, 7, 20))).toBeNull() // 8/20 夏休み
    expect(academicTermRange(new Date(2027, 2, 10))).toBeNull() // 3/10 春休み
  })

  it('境界日は期間に含む/含まないが1日単位で切り替わる', () => {
    expect(academicTermRange(new Date(2026, 2, 31))).toBeNull() // 3/31 は期間外
    expect(academicTermRange(new Date(2026, 3, 1))).not.toBeNull() // 4/1 から前期
    expect(academicTermRange(new Date(2026, 7, 7, 23, 59))).not.toBeNull() // 8/7 は最終日（時刻を持っても含む）
    expect(academicTermRange(new Date(2026, 7, 8))).toBeNull() // 8/8 から期間外
    expect(academicTermRange(new Date(2026, 8, 15))).toBeNull() // 9/15 は期間外
    expect(academicTermRange(new Date(2026, 8, 16))).not.toBeNull() // 9/16 から後期
    expect(academicTermRange(new Date(2027, 1, 7, 23, 59))).not.toBeNull() // 2/7 は最終日
    expect(academicTermRange(new Date(2027, 1, 8))).toBeNull() // 2/8 から期間外
  })
})

describe('deriveTermBounds（出欠データ無し＝学年暦フォールバック）', () => {
  it('学期起点はnullのまま（近似日付で「第N週」を出さない）', () => {
    expect(deriveTermBounds([], WED).termStartMonday).toBeNull()
  })

  it('前期の範囲（学期起点週〜学期末週）へ収める', () => {
    // 既定週月曜=7/13。前期 3/30(4/1の週)〜8/3(8/7の週) → min -15 / max 3
    expect(deriveTermBounds([], WED)).toEqual({ termStartMonday: null, min: -15, max: 3 })
  })

  it('報告された不具合：7月末に11月まで週送りできない（8月上旬で止まる）', () => {
    const b = deriveTermBounds([], new Date(2026, 6, 30)) // 2026-07-30 木・既定週月曜=7/27
    expect(b.max).toBe(1) // 8/7を含む週(8/3)まで。旧フォールバックの +16（11月中旬）は出さない
    expect(b.min).toBe(-17) // 4/1を含む週(3/30)まで
  })

  it('後期も学期末（翌2/7の週）で止まる', () => {
    const b = deriveTermBounds([], new Date(2026, 10, 5)) // 2026-11-05 木・既定週月曜=11/2
    expect(b.min).toBe(-7) // 9/16を含む週(9/14)
    expect(b.max).toBe(13) // 2027-02-07を含む週(2/1)
  })

  it('年明けの後期も学期末で止まる', () => {
    const b = deriveTermBounds([], new Date(2027, 0, 20)) // 2027-01-20 水・既定週月曜=1/18
    expect(b.max).toBe(2) // 2027-02-07を含む週(2/1)
  })

  it('授業期間外は今週から動かせない（min=max=現在週）', () => {
    const b = deriveTermBounds([], new Date(2026, 7, 20)) // 8/20 夏休み
    expect(b).toEqual({ termStartMonday: null, min: 0, max: 0 })
  })

  it('授業期間外でも現在週は到達可能（日曜は既定週が翌週＝offset -1）', () => {
    const b = deriveTermBounds([], new Date(2026, 7, 23)) // 8/23 日
    expect(b).toEqual({ termStartMonday: null, min: -1, max: -1 })
  })

  it('学期末をまたぐ日曜でも現在週は範囲に残る', () => {
    const b = deriveTermBounds([], new Date(2026, 7, 2)) // 8/2 日・既定週月曜=8/3（翌週）
    expect(b.min).toBe(-18)
    expect(b.max).toBe(0) // 8/7を含む週=既定週。現在週(-1)は範囲内
  })
})

describe('deriveTermBounds（出欠データあり＝実日付から導出・従来どおり）', () => {
  it('日付集合の最小/最大週を offset 範囲へ（7/8〜7/29 → min -1, max 2）', () => {
    const b = deriveTermBounds([new Date(2026, 6, 8), new Date(2026, 6, 29)], WED)
    expect([b.termStartMonday!.getMonth(), b.termStartMonday!.getDate()]).toEqual([6, 6]) // 7/6 月
    expect(b.min).toBe(-1)
    expect(b.max).toBe(2)
  })

  it('全て過去でも現在週(offset 0)は範囲に含める', () => {
    const b = deriveTermBounds([new Date(2026, 6, 1)], WED) // 7/1 水 → 週月曜 6/29
    expect(b.min).toBe(-2)
    expect(b.max).toBe(0) // maxOff=-2 だが現在週0を含める
  })

  it('授業期間外の now でも学年暦を参照せず実日付で導く（データ優先）', () => {
    // 8/20（夏休み）に前期の出欠日程が残っている状態。フォールバックなら min=max=0 だが、
    // データがある以上は前期の週へ戻れなければならない。
    const b = deriveTermBounds([new Date(2026, 6, 8), new Date(2026, 6, 29)], new Date(2026, 7, 20))
    expect(b.min).toBe(-6) // 7/6 の週
    expect(b.max).toBe(0) // 実データの最終週は過去（-3）だが現在週0は含める
  })
})
