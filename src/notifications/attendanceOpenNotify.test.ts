import { describe, it, expect } from 'vitest'
import {
  attendanceOpenKey,
  shouldNotifyAttendanceOpen,
  buildAttendanceOpenContent,
  pruneNotifiedAttendanceKeys,
  courseCodeByName,
} from './attendanceOpenNotify'

const NOW = new Date('2026-07-13T10:40:00+09:00') // ローカル(JST)で2026-07-13

describe('attendanceOpenKey', () => {
  it('当日キー＋科目名＋受付時間で dedup キーを作る', () => {
    expect(
      attendanceOpenKey({ courseName: '線形代数学1', confirmWindow: '10:40〜10:50', now: NOW }),
    ).toBe('2026-07-13|線形代数学1|10:40〜10:50')
  })

  it('科目名 null は ? にフォールバック', () => {
    expect(attendanceOpenKey({ courseName: null, confirmWindow: '10:40〜10:50', now: NOW })).toBe(
      '2026-07-13|?|10:40〜10:50',
    )
  })

  it('受付時間 null は ? にフォールバック', () => {
    expect(attendanceOpenKey({ courseName: '線形代数学1', confirmWindow: null, now: NOW })).toBe(
      '2026-07-13|線形代数学1|?',
    )
  })

  it('同日でも confirmWindow が異なれば別キー（再受付で再通知される）', () => {
    const a = attendanceOpenKey({ courseName: '英語', confirmWindow: '10:40〜10:50', now: NOW })
    const b = attendanceOpenKey({ courseName: '英語', confirmWindow: '13:00〜13:10', now: NOW })
    expect(a).not.toBe(b)
  })
})

describe('shouldNotifyAttendanceOpen', () => {
  const base = {
    status: 'accepting' as const,
    attendedNow: false,
    attendanceFocused: false,
    key: '2026-07-13|線形代数学1|10:40〜10:50',
    notifiedKeys: [] as string[],
  }

  it('受付中・未出席・フォーカス外・未通知なら true', () => {
    expect(shouldNotifyAttendanceOpen(base)).toBe(true)
  })

  it('status が accepting 以外なら false', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, status: 'closed' })).toBe(false)
    expect(shouldNotifyAttendanceOpen({ ...base, status: 'none' })).toBe(false)
    expect(shouldNotifyAttendanceOpen({ ...base, status: 'attended' })).toBe(false)
    expect(shouldNotifyAttendanceOpen({ ...base, status: 'unknown' })).toBe(false)
  })

  it('既に出席済み(attendedNow)なら false', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, attendedNow: true })).toBe(false)
  })

  it('出席画面フォーカス中なら false（バナーで足りる）', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, attendanceFocused: true })).toBe(false)
  })

  it('同一キーが通知済みなら false（重複通知防止）', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, notifiedKeys: [base.key] })).toBe(false)
  })

  it('別キーが通知済みでも当該キー未通知なら true', () => {
    expect(shouldNotifyAttendanceOpen({ ...base, notifiedKeys: ['2026-07-13|別科目|9:00〜9:10'] })).toBe(true)
  })
})

describe('buildAttendanceOpenContent', () => {
  it('科目・範囲ともあり', () => {
    expect(buildAttendanceOpenContent({ courseName: '線形代数学1', confirmWindow: '10:40〜10:50' })).toEqual({
      title: '出席受付が始まりました',
      body: '「線形代数学1」の出席受付中（10:40〜10:50）。タップして出席登録',
    })
  })

  it('科目 null（範囲あり）', () => {
    expect(buildAttendanceOpenContent({ courseName: null, confirmWindow: '10:40〜10:50' })).toEqual({
      title: '出席受付が始まりました',
      body: '出席受付が開いています（10:40〜10:50）。タップして出席登録',
    })
  })

  it('範囲 null（科目あり）は括弧を省略', () => {
    expect(buildAttendanceOpenContent({ courseName: '線形代数学1', confirmWindow: null })).toEqual({
      title: '出席受付が始まりました',
      body: '「線形代数学1」の出席受付中。タップして出席登録',
    })
  })

  it('両方 null', () => {
    expect(buildAttendanceOpenContent({ courseName: null, confirmWindow: null })).toEqual({
      title: '出席受付が始まりました',
      body: '出席受付が開いています。タップして出席登録',
    })
  })
})

describe('pruneNotifiedAttendanceKeys', () => {
  it('当日以外のキーを削除する', () => {
    const keys = ['2026-07-12|A|9:00〜9:10', '2026-07-13|B|10:40〜10:50', '2026-07-13|C|13:00〜13:10']
    expect(pruneNotifiedAttendanceKeys(keys, '2026-07-13')).toEqual([
      '2026-07-13|B|10:40〜10:50',
      '2026-07-13|C|13:00〜13:10',
    ])
  })

  it('当日キーは保持する', () => {
    const keys = ['2026-07-13|A|9:00〜9:10']
    expect(pruneNotifiedAttendanceKeys(keys, '2026-07-13')).toEqual(keys)
  })

  it('空配列はそのまま', () => {
    expect(pruneNotifiedAttendanceKeys([], '2026-07-13')).toEqual([])
  })
})


describe('科目別OFFを受付open通知にも効かせる', () => {
  // 修正前は科目別OFFが**予約型アラームにしか効かず**、OFFにした科目の受付open通知が
  // MAXチャンネル（音＋ヘッドアップ）で届いていた＝アプリ内に止める手段が無かった。
  const ok = {
    status: 'accepting' as const,
    attendedNow: false,
    attendanceFocused: false,
    key: '2026-07-17|物理学実験Ａ|14:40〜16:10',
    notifiedKeys: [] as string[],
  }

  it('OFFにした科目は通知しない', () => {
    expect(shouldNotifyAttendanceOpen({ ...ok, courseDisabled: true })).toBe(false)
  })

  it('ONの科目はこれまで通り通知する', () => {
    expect(shouldNotifyAttendanceOpen({ ...ok, courseDisabled: false })).toBe(true)
  })

  it('指定が無ければ通知する（後方互換・黙って殺さない）', () => {
    expect(shouldNotifyAttendanceOpen(ok)).toBe(true)
    expect(shouldNotifyAttendanceOpen({ ...ok, courseDisabled: undefined })).toBe(true)
  })
})

describe('courseCodeByName（設定の courseCode 鍵と受付の科目名を橋渡し）', () => {
  const col = (classes: { courseCode: string; name: string }[]) => ({ slots: [{ classes }] })

  it('科目名からcourseCodeを引く', () => {
    const cols = [col([{ courseCode: '9973344', name: '物理学実験Ａ' }])]
    expect(courseCodeByName(cols, '物理学実験Ａ')).toBe('9973344')
  })

  it('複数コレクション・複数slotを横断して引く', () => {
    const cols = [
      col([{ courseCode: 'A', name: '英語' }]),
      col([{ courseCode: 'B', name: '物理' }]),
    ]
    expect(courseCodeByName(cols, '物理')).toBe('B')
  })

  it('引けなければ null（＝呼び出し側は通知する側に倒す）', () => {
    const cols = [col([{ courseCode: 'A', name: '英語' }])]
    expect(courseCodeByName(cols, '物理学実験Ａ')).toBeNull()
    expect(courseCodeByName(cols, null)).toBeNull()
    expect(courseCodeByName([], '英語')).toBeNull()
  })

  it('表記が少しでも違えば引かない（誤った科目のOFFを適用しない）', () => {
    const cols = [col([{ courseCode: 'A', name: '基礎電気数学及び演習 （１組）' }])]
    // 全角/半角・空白の揺れは一致させない＝失敗の向きは「余分に鳴る」側で安全
    expect(courseCodeByName(cols, '基礎電気数学及び演習（1組）')).toBeNull()
  })
})
