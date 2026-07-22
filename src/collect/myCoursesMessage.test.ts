import { parseMyCoursesMessage, isMyCoursesUrl } from './myCoursesMessage'

const MY = 'https://letus.ed.tus.ac.jp/my/courses.php'

describe('isMyCoursesUrl', () => {
  it('マイコース本体はクエリ・ハッシュ・末尾スラッシュ付きでも通す', () => {
    // ここを厳しくすると LetusSyncEngine の全コース同期まで恒久的に止まる。
    for (const u of [MY, MY + '?lang=ja', MY + '#foo', MY + '?lang=ja#foo', MY + '/']) {
      expect(isMyCoursesUrl(u)).toBe(true)
    }
  })
  it('コースページや前方一致・部分一致の穴を弾く', () => {
    for (const u of [
      'https://letus.ed.tus.ac.jp/course/view.php?id=219360',
      'https://letus.ed.tus.ac.jp/course/view.php?returnurl=/my/courses.php',
      MY + '.bak',
      MY + 'x',
      MY + '/extra',
    ]) {
      expect(isMyCoursesUrl(u)).toBe(false)
    }
  })
  it('ホストのサフィックス一致と平文を弾く', () => {
    for (const u of [
      'https://letus.ed.tus.ac.jp.evil.example/my/courses.php',
      'https://evil.example/my/courses.php',
      'http://letus.ed.tus.ac.jp/my/courses.php',
    ]) {
      expect(isMyCoursesUrl(u)).toBe(false)
    }
  })
  it('文字列でない値・空文字は false', () => {
    for (const u of [undefined, null, 123, '']) expect(isMyCoursesUrl(u)).toBe(false)
  })
})

describe('parseMyCoursesMessage', () => {
  const html = '<a href="/course/view.php?id=1">基礎情報工学A (9973339)</a>'
  it('正常ペイロードを構造化する', () => {
    const raw = JSON.stringify({ type: 'mycourses', html, origin: 'https://letus.ed.tus.ac.jp', url: MY })
    const r = parseMyCoursesMessage(raw)
    expect(r.error).toBeNull()
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].codes).toEqual(['9973339'])
  })
  it('course/view.phpが無ければ収集失敗エラー', () => {
    const raw = JSON.stringify({ type: 'mycourses', html: '<a href="/x">y</a>', origin: 'https://letus.ed.tus.ac.jp', url: MY })
    expect(parseMyCoursesMessage(raw).error).toBe('コースを取得できませんでした')
  })
  it('コースページで収集したら保存させない', () => {
    // WebView内でコースを開いてから「コースを収集」すると、パンくずの course/view.php リンク1件だけが
    // 拾われて成功扱いになり、対応表(全置換)が1件に潰れていた。
    const raw = JSON.stringify({
      type: 'mycourses',
      html,
      origin: 'https://letus.ed.tus.ac.jp',
      url: 'https://letus.ed.tus.ac.jp/course/view.php?id=219360',
    })
    const r = parseMyCoursesMessage(raw)
    expect(r.courses).toEqual([])
    expect(r.error).toBe('コース一覧ページ（マイコース）で実行してください')
  })
  it('収集元URLが無いペイロードは誤ページ扱いにする', () => {
    const raw = JSON.stringify({ type: 'mycourses', html, origin: 'https://letus.ed.tus.ac.jp' })
    expect(parseMyCoursesMessage(raw).courses).toEqual([])
  })
  it('JSON破損・type違いは解析エラー', () => {
    for (const raw of ['not-json', 'null', JSON.stringify({ type: 'timetable' })]) {
      const r = parseMyCoursesMessage(raw)
      expect(r.courses).toEqual([])
      expect(r.error).toBe('メッセージを解析できませんでした')
    }
  })
})
