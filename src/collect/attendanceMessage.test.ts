import { describe, expect, it } from 'vitest'
import { parseAttendanceMessage } from './attendanceMessage'

const msg = (o: Record<string, unknown>) => JSON.stringify({ type: 'attendance', ...o })

describe('parseAttendanceMessage', () => {
  it('受付なし: NONE文言 → status none・エラーなし', () => {
    const r = parseAttendanceMessage(msg({ text: '現在、出席確認中の履修授業はありません。' }))
    expect(r.status).toBe('none')
    expect(r.accepting).toBe(false)
    expect(r.error).toBeNull()
  })

  it('受付中(未提出): hasCodeInput → accepting・確認時間/残り抽出', () => {
    const text = '08:50〜10:20 化学1\n出席確認時間：08:50〜09:20\nあと6分50秒'
    const r = parseAttendanceMessage(msg({ text, courseName: '化学1', hasCodeInput: true, timeSum: 410 }))
    expect(r.status).toBe('accepting')
    expect(r.accepting).toBe(true)
    expect(r.courseName).toBe('化学1')
    expect(r.confirmWindow).toBe('08:50〜09:20')
    expect(r.remaining).toBe('あと6分50秒')
  })

  it('出席済み: attendSuc → attended（本文が薄くても確定・cross-device）', () => {
    const text = '08:50〜10:20 化学1\n出席確認時間：08:50〜09:20\n出席確認終了\n出席'
    const r = parseAttendanceMessage(msg({ text, courseName: '化学1', attendSuc: true, signEnded: true, timeSum: -1 }))
    expect(r.status).toBe('attended')
    expect(r.accepting).toBe(false)
    expect(r.courseName).toBe('化学1')
    expect(r.confirmWindow).toBe('08:50〜09:20')
  })

  it('出席済みは hasCodeInput より優先（両立時はattended）', () => {
    const r = parseAttendanceMessage(msg({ text: '化学1\n出席確認時間：08:50〜09:20', attendSuc: true, hasCodeInput: true }))
    expect(r.status).toBe('attended')
  })

  it('受付終了・未提出: 科目あり・入力なし・signEnded → closed', () => {
    const text = '08:50〜10:20 化学1\n出席確認時間：08:50〜09:20\n出席確認終了'
    const r = parseAttendanceMessage(msg({ text, courseName: '化学1', hasCodeInput: false, signEnded: true }))
    expect(r.status).toBe('closed')
    expect(r.confirmWindow).toBe('08:50〜09:20')
  })

  it('timeSum<=0 でも受付終了とみなす', () => {
    const r = parseAttendanceMessage(msg({ text: '化学1\n出席確認時間：08:50〜09:20', hasCodeInput: false, timeSum: -1 }))
    expect(r.status).toBe('closed')
  })

  it('遷移中/判定不能: どの目印もない → unknown', () => {
    const r = parseAttendanceMessage(msg({ text: '読み込み中...' }))
    expect(r.status).toBe('unknown')
    expect(r.error).toBeNull()
  })

  it('本文が空（attendSucも無い）→ 読み取り失敗', () => {
    const r = parseAttendanceMessage(msg({ text: '   ' }))
    expect(r.status).toBe('unknown')
    expect(r.error).toBe('出席受付状況を読み取れませんでした')
  })

  it('JSON破損・非オブジェクト・type違いは解析エラー', () => {
    for (const raw of ['not-json', 'null', '42', '"x"', JSON.stringify({ type: 'timetable' })]) {
      const r = parseAttendanceMessage(raw)
      expect(r.status).toBe('unknown')
      expect(r.error).toBe('メッセージを解析できませんでした')
    }
  })
})
