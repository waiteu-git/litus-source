import { describe, it, expect } from 'vitest'
import { deriveTermBounds, academicTermRange, lastEndedTermRange } from './termBounds'
import { currentWeekOffset } from './weekNav'

const WED = new Date(2026, 6, 15) // 2026-07-15 水（現在週offset=0・既定週月曜=7/13）

const md = (d: Date) => [d.getMonth() + 1, d.getDate()]

// 境界は実際の学年暦より意図的に広い（早く始まり遅く終わる）。実暦へ寄せて狭めると、
// ドリフトした年に実際の授業日が「授業期間外」へ落ちて週送りが死ぬ。termBounds.ts の ⚠コメント参照。
describe('academicTermRange', () => {
  it('前期は4/1〜8/15（実際の授業期間より広く取る）', () => {
    const t = academicTermRange(new Date(2026, 4, 20))!
    expect(md(t.start)).toEqual([4, 1])
    expect(md(t.lastDay)).toEqual([8, 15])
    expect(t.start.getFullYear()).toBe(2026)
    expect(t.lastDay.getFullYear()).toBe(2026)
  })

  it('後期は9/1〜翌2/15（年跨ぎ・実際の授業期間より広く取る）', () => {
    const t = academicTermRange(new Date(2026, 10, 5))!
    expect([t.start.getFullYear(), ...md(t.start)]).toEqual([2026, 9, 1])
    expect([t.lastDay.getFullYear(), ...md(t.lastDay)]).toEqual([2027, 2, 15])
  })

  it('年明け（1月）も前年度の後期として解決する', () => {
    const t = academicTermRange(new Date(2027, 0, 20))!
    expect([t.start.getFullYear(), ...md(t.start)]).toEqual([2026, 9, 1])
    expect([t.lastDay.getFullYear(), ...md(t.lastDay)]).toEqual([2027, 2, 15])
  })

  it('授業期間外は 8/16〜8/31（夏休み）と 2/16〜3/31（春休み）だけ', () => {
    expect(academicTermRange(new Date(2026, 7, 20))).toBeNull() // 8/20 夏休み
    expect(academicTermRange(new Date(2027, 2, 10))).toBeNull() // 3/10 春休み
  })

  it('実暦がドリフトしうる学期の入口・出口は授業期間に含む（狭めていないことの確認）', () => {
    // 2026年度の後期授業開始は9/11。旧境界(9/16開始)ではこの日が期間外に落ちていた。
    expect(academicTermRange(new Date(2026, 8, 11))).not.toBeNull() // 9/11 後期授業開始日
    expect(academicTermRange(new Date(2026, 8, 15))).not.toBeNull() // 9/15 旧境界では期間外
    expect(academicTermRange(new Date(2026, 3, 3))).not.toBeNull() // 4/3 前期の入口
    expect(academicTermRange(new Date(2026, 7, 10))).not.toBeNull() // 8/10 前期の出口（旧境界では期間外）
    expect(academicTermRange(new Date(2027, 1, 12))).not.toBeNull() // 2/12 後期の出口（旧境界では期間外）
  })

  it('境界日は期間に含む/含まないが1日単位で切り替わる', () => {
    expect(academicTermRange(new Date(2026, 2, 31))).toBeNull() // 3/31 は期間外
    expect(academicTermRange(new Date(2026, 3, 1))).not.toBeNull() // 4/1 から前期
    expect(academicTermRange(new Date(2026, 7, 15, 23, 59))).not.toBeNull() // 8/15 は最終日（時刻を持っても含む）
    expect(academicTermRange(new Date(2026, 7, 16))).toBeNull() // 8/16 から期間外
    expect(academicTermRange(new Date(2026, 7, 31))).toBeNull() // 8/31 は期間外
    expect(academicTermRange(new Date(2026, 8, 1))).not.toBeNull() // 9/1 から後期
    expect(academicTermRange(new Date(2027, 1, 15, 23, 59))).not.toBeNull() // 2/15 は最終日
    expect(academicTermRange(new Date(2027, 1, 16))).toBeNull() // 2/16 から期間外
  })
})

describe('lastEndedTermRange', () => {
  it('夏休み（8/16〜8/31）では直前の前期を返す', () => {
    const t = lastEndedTermRange(new Date(2026, 7, 20))!
    expect([t.start.getFullYear(), ...md(t.start)]).toEqual([2026, 4, 1])
    expect([t.lastDay.getFullYear(), ...md(t.lastDay)]).toEqual([2026, 8, 15])
  })

  it('春休み（2/16〜3/31）では年跨ぎの後期を返す（前年9月開始）', () => {
    const t = lastEndedTermRange(new Date(2027, 2, 10))!
    expect([t.start.getFullYear(), ...md(t.start)]).toEqual([2026, 9, 1])
    expect([t.lastDay.getFullYear(), ...md(t.lastDay)]).toEqual([2027, 2, 15])
  })
})

describe('deriveTermBounds（出欠データ無し＝学年暦フォールバック）', () => {
  it('学期起点はnullのまま（近似日付で「第N週」を出さない）', () => {
    expect(deriveTermBounds([], WED).termStartMonday).toBeNull()
  })

  it('前期の範囲（学期起点週〜学期末週）へ収める', () => {
    // 既定週月曜=7/13。前期 3/30(4/1の週)〜8/10(8/15の週) → min -15 / max 4
    expect(deriveTermBounds([], WED)).toEqual({ termStartMonday: null, min: -15, max: 4 })
  })

  it('報告された不具合：7月末に11月まで週送りできない（8月中旬で止まる）', () => {
    const b = deriveTermBounds([], new Date(2026, 6, 30)) // 2026-07-30 木・既定週月曜=7/27
    expect(b.max).toBe(2) // 8/15を含む週(8/10)まで。旧フォールバックの +16（11月中旬）は出さない
    expect(b.min).toBe(-17) // 4/1を含む週(3/30)まで
  })

  it('後期も学期末（翌2/15の週）で止まる', () => {
    const b = deriveTermBounds([], new Date(2026, 10, 5)) // 2026-11-05 木・既定週月曜=11/2
    expect(b.min).toBe(-9) // 9/1を含む週(8/31)
    expect(b.max).toBe(15) // 2027-02-15の週
  })

  it('年明けの後期も学期末で止まる', () => {
    const b = deriveTermBounds([], new Date(2027, 0, 20)) // 2027-01-20 水・既定週月曜=1/18
    expect(b.max).toBe(4) // 2027-02-15の週
  })

  it('回帰: 後期第1週（授業開始 2026-09-11 を含む週）でも週送りが効く', () => {
    // 旧境界（後期を9/16開始としていた）では9/11が「授業期間外」に落ち、min=max=現在週＝
    // 前後どちらの矢印も死んでいた。新規インストール直後（出欠データ無し）の後期第1週が丸ごとこれに当たる。
    const b = deriveTermBounds([], new Date(2026, 8, 11)) // 2026-09-11 金・既定週月曜=9/7
    expect(b.min).toBe(-1) // 9/1を含む週(8/31)まで戻れる
    expect(b.max).toBe(23) // 2027-02-15を含む週まで進める
  })

  it('回帰: 後期第1週のどの日でも前後どちらへも送れる（矢印が両方死なない）', () => {
    for (const day of [7, 8, 9, 10, 11, 12, 13]) {
      const now = new Date(2026, 8, day)
      const b = deriveTermBounds([], now)
      const cwo = currentWeekOffset(now)
      expect(b.min, `9/${day} の min`).toBeLessThan(cwo)
      expect(b.max, `9/${day} の max`).toBeGreaterThan(cwo)
    }
  })

  it('授業期間外は直近に終わった学期まで戻れる（前方向は今週で止める）', () => {
    const b = deriveTermBounds([], new Date(2026, 7, 20)) // 8/20 夏休み・既定週月曜=8/17
    expect(b).toEqual({ termStartMonday: null, min: -20, max: 0 }) // 前期4/1の週(3/30)まで戻れる
  })

  it('春休みは年跨ぎの後期（前年9月開始）まで戻れる', () => {
    const b = deriveTermBounds([], new Date(2027, 2, 10)) // 2027-03-10 水・既定週月曜=3/8
    expect(b).toEqual({ termStartMonday: null, min: -27, max: 0 }) // 2026-09-01の週(8/31)まで
  })

  it('授業期間外でも現在週は到達可能（日曜は既定週が翌週＝offset -1）', () => {
    const b = deriveTermBounds([], new Date(2026, 7, 23)) // 8/23 日・既定週月曜=8/24
    expect(b).toEqual({ termStartMonday: null, min: -21, max: -1 }) // max は現在週(-1)＝前へは送らない
  })

  it('学期末をまたぐ日曜でも現在週は範囲に残る', () => {
    const b = deriveTermBounds([], new Date(2026, 7, 2)) // 8/2 日・既定週月曜=8/3（翌週）
    expect(b.min).toBe(-18)
    expect(b.max).toBe(1) // 8/15を含む週(8/10)まで。現在週(-1)は範囲内
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
    // 8/20（夏休み）に前期の出欠日程が残っている状態。フォールバックなら学年暦の近似で 4/1 の週まで
    // 開くが、データがある以上は実日付が示す前期の週（7/6〜）だけを範囲にしなければならない。
    const b = deriveTermBounds([new Date(2026, 6, 8), new Date(2026, 6, 29)], new Date(2026, 7, 20))
    expect(b.min).toBe(-6) // 7/6 の週
    expect(b.max).toBe(0) // 実データの最終週は過去（-3）だが現在週0は含める
  })
})
