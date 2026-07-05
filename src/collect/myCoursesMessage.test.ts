import { parseMyCoursesMessage } from './myCoursesMessage'

describe('parseMyCoursesMessage', () => {
  const html = '<a href="/course/view.php?id=1">基礎情報工学A (9973339)</a>'
  it('正常ペイロードを構造化する', () => {
    const raw = JSON.stringify({ type: 'mycourses', html, origin: 'https://letus.ed.tus.ac.jp' })
    const r = parseMyCoursesMessage(raw)
    expect(r.error).toBeNull()
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].codes).toEqual(['9973339'])
  })
  it('course/view.phpが無ければ収集失敗エラー', () => {
    const raw = JSON.stringify({ type: 'mycourses', html: '<a href="/x">y</a>', origin: 'https://letus.ed.tus.ac.jp' })
    expect(parseMyCoursesMessage(raw).error).toBe('コースを取得できませんでした')
  })
  it('JSON破損・type違いは解析エラー', () => {
    for (const raw of ['not-json', 'null', JSON.stringify({ type: 'timetable' })]) {
      const r = parseMyCoursesMessage(raw)
      expect(r.courses).toEqual([])
      expect(r.error).toBe('メッセージを解析できませんでした')
    }
  })
})
