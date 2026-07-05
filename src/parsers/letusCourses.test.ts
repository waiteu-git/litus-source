import { extractCourseCodesFromName, parseMyCourses, buildCourseCodeMap } from './letusCourses'

const ORIGIN = 'https://letus.ed.tus.ac.jp'

describe('extractCourseCodesFromName', () => {
  it('末尾括弧の7桁を抜く（空白有無問わず）', () => {
    expect(extractCourseCodesFromName('基礎情報工学A (9973339)')).toEqual(['9973339'])
    expect(extractCourseCodesFromName('電気電子情報工学デザイン (9973366)')).toEqual(['9973366'])
  })
  it('統合コースの複数コード(+区切り)を全部抜く', () => {
    expect(extractCourseCodesFromName('基礎電気数学及び演習(9973337+9973338)')).toEqual(['9973337', '9973338'])
  })
  it('コード無し（特別コース）は空配列', () => {
    expect(extractCourseCodesFromName('情報セキュリティ コラム')).toEqual([])
  })
})

describe('parseMyCourses', () => {
  const HTML = `
    <div>
      <a href="/course/view.php?id=216412">基礎電気工学 (9973365)</a>
      <a href="/course/view.php?id=100"><img src="x.png"></a>
      <a href="/course/view.php?id=101">基礎電気数学及び演習(9973337+9973338)</a>
      <a href="/course/view.php?id=101">基礎電気数学及び演習(9973337+9973338)</a>
      <a href="/course/view.php?id=102">TA研修</a>
      <a href="/grade/report/user/index.php?id=1">成績</a>
    </div>`
  it('course/view.phpリンクのみ・URL重複排除・コード抽出付きで返す', () => {
    const courses = parseMyCourses(HTML, ORIGIN)
    expect(courses).toEqual([
      { name: '基礎電気工学 (9973365)', url: 'https://letus.ed.tus.ac.jp/course/view.php?id=216412', codes: ['9973365'] },
      { name: '基礎電気数学及び演習(9973337+9973338)', url: 'https://letus.ed.tus.ac.jp/course/view.php?id=101', codes: ['9973337', '9973338'] },
      { name: 'TA研修', url: 'https://letus.ed.tus.ac.jp/course/view.php?id=102', codes: [] },
    ])
  })
})

describe('buildCourseCodeMap', () => {
  it('統合コースは複数コードから同一コースへ張る', () => {
    const courses = [
      { name: 'A', url: 'u1', codes: ['9973337', '9973338'] },
      { name: 'B', url: 'u2', codes: ['9973339'] },
      { name: 'C', url: 'u3', codes: [] },
    ]
    const map = buildCourseCodeMap(courses)
    expect(map['9973337'].url).toBe('u1')
    expect(map['9973338'].url).toBe('u1')
    expect(map['9973339'].url).toBe('u2')
    expect(Object.keys(map)).toHaveLength(3)
  })
})
