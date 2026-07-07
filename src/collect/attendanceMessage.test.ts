import { parseAttendanceMessage } from './attendanceMessage'

describe('parseAttendanceMessage', () => {
  it('「出席確認中の履修授業はありません」なら受付なし・エラーなし', () => {
    const raw = JSON.stringify({ type: 'attendance', text: '現在、出席確認中の履修授業はありません。', courseName: '' })
    expect(parseAttendanceMessage(raw)).toEqual({ accepting: false, courseName: null, confirmWindow: null, remaining: null, error: null })
  })

  it('受付中科目名がcourseNameで来れば受付中', () => {
    const raw = JSON.stringify({ type: 'attendance', text: '基礎情報工学A 出席確認中', courseName: '基礎情報工学A' })
    expect(parseAttendanceMessage(raw)).toEqual({ accepting: true, courseName: '基礎情報工学A', confirmWindow: null, remaining: null, error: null })
  })

  it('courseNameが空でも本文に受付なしマーカーが無ければ受付中（本文をフォールバック科目名にする）', () => {
    const raw = JSON.stringify({ type: 'attendance', text: '図学・製図', courseName: '' })
    expect(parseAttendanceMessage(raw)).toEqual({ accepting: true, courseName: '図学・製図', confirmWindow: null, remaining: null, error: null })
  })

  it('本文が空なら読み取り失敗エラー', () => {
    const raw = JSON.stringify({ type: 'attendance', text: '   ', courseName: '' })
    expect(parseAttendanceMessage(raw)).toEqual({ accepting: false, courseName: null, confirmWindow: null, remaining: null, error: '出席受付状況を読み取れませんでした' })
  })

  it('JSON破損・非オブジェクト・type違いはクラッシュせず解析エラー', () => {
    for (const raw of ['not-json', 'null', '42', '"x"', JSON.stringify({ type: 'timetable' })]) {
      expect(parseAttendanceMessage(raw)).toEqual({ accepting: false, courseName: null, confirmWindow: null, remaining: null, error: 'メッセージを解析できませんでした' })
    }
  })

  it('受付中は確認時間帯と残り時間を抽出する', () => {
    const text = '出席確認中\n基礎電気工学\n出席確認時間：12:50〜14:30\nあと91分39秒で終了'
    const r = parseAttendanceMessage(JSON.stringify({ type: 'attendance', text, courseName: '基礎電気工学' }))
    expect(r.accepting).toBe(true)
    expect(r.confirmWindow).toBe('12:50〜14:30')
    expect(r.remaining).toBe('あと91分39秒')
  })

  it('受付なしは confirmWindow/remaining が null', () => {
    const r = parseAttendanceMessage(
      JSON.stringify({ type: 'attendance', text: '出席確認中の履修授業はありません' }),
    )
    expect(r.accepting).toBe(false)
    expect(r.confirmWindow).toBeNull()
    expect(r.remaining).toBeNull()
  })
})
