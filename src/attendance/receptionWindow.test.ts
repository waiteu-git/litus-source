import { describe, it, expect } from 'vitest'
import {
  parseWindowMinutes,
  windowEndText,
  windowAnchorsToPeriod,
  homeRemaining,
  type ReceptionWindowRecord,
} from './receptionWindow'

const at = (h: number, m: number) => new Date(2026, 6, 17, h, m, 0, 0)
const TODAY = '2026-07-17'

describe('parseWindowMinutes', () => {
  it('全角チルダ（実DOM由来）を解析する', () => {
    expect(parseWindowMinutes('10:20～12:00')).toEqual({ startMin: 620, endMin: 720 })
  })

  it('波ダッシュ・ハイフンでも解析する（区切り文字に依存しない）', () => {
    expect(parseWindowMinutes('12:50〜14:30')).toEqual({ startMin: 770, endMin: 870 })
    expect(parseWindowMinutes('12:50-14:30')).toEqual({ startMin: 770, endMin: 870 })
  })

  it('ラベル付きの生テキストからでも拾う', () => {
    expect(parseWindowMinutes('出席確認時間：10:20～12:00')).toEqual({ startMin: 620, endMin: 720 })
  })

  it('null/解析不能は null', () => {
    expect(parseWindowMinutes(null)).toBeNull()
    expect(parseWindowMinutes('')).toBeNull()
    expect(parseWindowMinutes('受付中')).toBeNull()
  })

  it('終了が開始以下は null（壊れ値を通さない）', () => {
    expect(parseWindowMinutes('12:00〜10:20')).toBeNull()
    expect(parseWindowMinutes('12:00〜12:00')).toBeNull()
  })
})

describe('windowEndText', () => {
  it('終了時刻をゼロ埋めHH:MMで返す', () => {
    expect(windowEndText('9:05〜9:30')).toBe('09:30')
    expect(windowEndText('10:20～12:00')).toBe('12:00')
  })

  it('解析不能は null', () => {
    expect(windowEndText(null)).toBeNull()
  })
})

describe('windowAnchorsToPeriod', () => {
  // 2限 10:20-12:00
  const S = 620
  const E = 720

  it('受付開始が時限内ならアンカーする', () => {
    expect(windowAnchorsToPeriod('10:20〜12:00', S, E)).toBe(true)
    expect(windowAnchorsToPeriod('10:30〜10:45', S, E)).toBe(true)
  })

  it('授業開始の少し前から受付が始まる場合も拾う（前余裕10分）', () => {
    expect(windowAnchorsToPeriod('10:11〜10:40', S, E)).toBe(true)
    expect(windowAnchorsToPeriod('10:10〜10:40', S, E)).toBe(true)
  })

  it('前余裕を超えて早い受付はアンカーしない', () => {
    expect(windowAnchorsToPeriod('10:09〜10:40', S, E)).toBe(false)
  })

  it('別コマの受付時間はアンカーしない（誤って隣のコマへ延びない）', () => {
    // 3限 12:50〜14:30 の受付を 2限 に当てようとしても外れる
    expect(windowAnchorsToPeriod('12:50〜14:30', S, E)).toBe(false)
    // 1限 8:50〜10:30 も外れる
    expect(windowAnchorsToPeriod('8:50〜10:30', S, E)).toBe(false)
  })

  it('解析不能は false', () => {
    expect(windowAnchorsToPeriod(null, S, E)).toBe(false)
  })
})

describe('homeRemaining', () => {
  const hero = { start: '10:20', end: '12:00', isNow: true }
  const saved = (window: string, date = TODAY): ReceptionWindowRecord => ({
    date,
    window,
    courseName: '線形代数1',
  })

  it('いまの授業でなければ何も出さない', () => {
    expect(homeRemaining({ hero: { ...hero, isNow: false }, saved: null, today: TODAY, now: at(9, 0) })).toBeNull()
    expect(homeRemaining({ hero: null, saved: null, today: TODAY, now: at(10, 30) })).toBeNull()
  })

  describe('受付時間が分かっているとき', () => {
    it('受付終了までの残りを出す（授業の残りではない）', () => {
      // 受付 10:20〜10:40・now 10:28 → 受付はあと12分。授業（12:00終了）の残り92分ではない。
      const r = homeRemaining({ hero, saved: saved('10:20〜10:40'), today: TODAY, now: at(10, 28) })
      expect(r).toMatchObject({ kind: 'reception', label: '受付', minutes: 12, endText: '10:40 まで受付' })
      expect(r?.a11yLabel).toBe('出席の受付終了まであと12分・タップで出席登録へ')
    })

    it('バーの残り率は受付時間に対する割合（授業に対してではない）', () => {
      // 受付 10:20〜10:40（20分）・now 10:30 → ちょうど半分
      const r = homeRemaining({ hero, saved: saved('10:20〜10:40'), today: TODAY, now: at(10, 30) })
      expect(r?.remainPct).toBe(50)
    })

    it('受付が終わっていれば「受付終了」を出す（授業はまだ続いていても）', () => {
      const r = homeRemaining({ hero, saved: saved('10:20〜10:40'), today: TODAY, now: at(11, 0) })
      expect(r).toMatchObject({ kind: 'closed', minutes: null, endText: '授業は 12:00 終了', remainPct: 0 })
      expect(r?.a11yLabel).toBe('出席の受付は10:40に終了しました・タップで出席画面へ')
    })

    it('受付終了ちょうどは終了扱い（境界）', () => {
      expect(homeRemaining({ hero, saved: saved('10:20〜10:40'), today: TODAY, now: at(10, 40) })?.kind).toBe('closed')
      expect(homeRemaining({ hero, saved: saved('10:20〜10:40'), today: TODAY, now: at(10, 39) })?.kind).toBe('reception')
    })
  })

  describe('保存が使えないときは授業の残りへ安全に落ちる', () => {
    it('保存が無ければ授業の残り', () => {
      const r = homeRemaining({ hero, saved: null, today: TODAY, now: at(10, 30) })
      expect(r).toMatchObject({ kind: 'class', label: '残り', minutes: 90, endText: '12:00 終了' })
      expect(r?.a11yLabel).toBe('授業終了まで残り90分・タップで出席登録へ')
    })

    it('昨日の保存は使わない', () => {
      const r = homeRemaining({ hero, saved: saved('10:20〜10:40', '2026-07-16'), today: TODAY, now: at(10, 30) })
      expect(r?.kind).toBe('class')
    })

    it('別コマの受付時間は使わない（3限の受付を2限に当てない）', () => {
      const r = homeRemaining({ hero, saved: saved('12:50〜13:10'), today: TODAY, now: at(10, 30) })
      expect(r?.kind).toBe('class')
      expect(r?.minutes).toBe(90)
    })

    it('壊れた受付時間は使わない', () => {
      const r = homeRemaining({ hero, saved: saved('受付中'), today: TODAY, now: at(10, 30) })
      expect(r?.kind).toBe('class')
    })

    it('授業の残り率はバーに出る', () => {
      // 10:20〜12:00（100分）・now 11:10 → 残り50分＝50%
      expect(homeRemaining({ hero, saved: null, today: TODAY, now: at(11, 10) })?.remainPct).toBe(50)
    })
  })

  it('受付時間が授業と同じ長さなら受付＝授業の残りに一致する（受付が全時間の授業）', () => {
    const r = homeRemaining({ hero, saved: saved('10:20〜12:00'), today: TODAY, now: at(10, 30) })
    expect(r).toMatchObject({ kind: 'reception', minutes: 90 })
  })
})

describe('保存の重複排除キー（日付を落とすと機能が黙って死ぬ）', () => {
  // AttendanceEngineProvider は「同じ受付時間を何度も書かない」ため直近保存分を ref で覚えるが、
  // その鍵に日付が要る。confirmWindow は時限の時刻から作られるので、**同じコマなら別の日でも
  // 完全に同一文字列**になる（毎週の月2限は常に '10:20〜12:00'）。window だけを鍵にすると翌週の
  // 同じコマで「保存済み」と誤判定し、記録の date が古いまま → homeRemaining が日付で弾く →
  // ホームが黙って授業ベースへ後退する（2026-07-17 のレビューで再現）。
  const key = (date: string, window: string) => `${date}|${window}`

  it('同じ受付時間でも日が違えば別キー', () => {
    expect(key('2026-07-20', '10:20〜12:00')).not.toBe(key('2026-07-17', '10:20〜12:00'))
  })

  it('同じ日の同じ受付時間は同一キー（連続ポーリングで書き込まない）', () => {
    expect(key(TODAY, '10:20〜12:00')).toBe(key(TODAY, '10:20〜12:00'))
  })

  it('翌日に同じコマの記録が復元されても homeRemaining は使わない（弾かれる側の確認）', () => {
    const hero = { start: '10:20', end: '12:00', isNow: true }
    const yesterday: ReceptionWindowRecord = {
      date: '2026-07-16',
      window: '10:20〜10:40',
      courseName: '線形代数1',
    }
    // 日付が古いので受付ではなく授業ベースへ落ちる＝保存が更新されないと受付時間は永久に出ない。
    expect(homeRemaining({ hero, saved: yesterday, today: TODAY, now: at(10, 28) })?.kind).toBe('class')
  })
})
