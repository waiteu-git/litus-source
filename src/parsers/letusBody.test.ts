import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseAssignBody } from './letusBody'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(here, '__fixtures__', 'letus-assign-body.html'), 'utf8')
const realFixture = readFileSync(join(here, '__fixtures__', 'letus-assign-body-real.html'), 'utf8')

describe('parseAssignBody', () => {
  it('#intro の説明本文を改行保持で抽出する', () => {
    const body = parseAssignBody(fixture)
    expect(body.description).toContain('第3回レポート課題です。')
    expect(body.description).toContain('次の設問に答えてください。')
    expect(body.description).toContain('分量は2ページ以内。')
    expect(body.description).toMatch(/課題です。\n次の設問/)
  })

  it('pluginfile 添付をURLでdedupして抽出する', () => {
    const body = parseAssignBody(fixture)
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].name).toBe('課題3_問題.pdf')
    expect(body.attachments[0].url).toContain('/pluginfile.php/')
  })

  it('intro も添付も無いHTML（ログイン等）は空を返す', () => {
    const body = parseAssignBody('<html><body><input type="password"></body></html>')
    expect(body.description).toBe('')
    expect(body.attachments).toEqual([])
  })
})

describe('parseAssignBody（実LETUS Moodle 4.x 構造）', () => {
  it('#intro が [role="main"] の外（#region-main 直下）でも本文を抽出する', () => {
    const body = parseAssignBody(realFixture)
    expect(body.description).toContain('次の設問に答えてください。')
    expect(body.description).toContain('設問1: 概要を200字で説明する。')
    expect(body.description).toContain('分量は2ページ以内。')
    // .no-overflow の本文のみ＝添付ファイル名や提出ファイル名は本文に混ざらない
    expect(body.description).not.toContain('課題4_問題.pdf')
    expect(body.description).not.toContain('my_submission.docx')
  })

  it('課題添付(introattachment)のみを添付として抽出し、提出ファイルは除外する', () => {
    const body = parseAssignBody(realFixture)
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].name).toBe('課題4_問題.pdf')
    expect(body.attachments[0].url).toContain('/mod_assign/introattachment/')
    // 学生の提出ファイル(#intro の外)は課題添付ではない
    expect(body.attachments.some((a) => a.url.includes('assignsubmission_file'))).toBe(false)
  })

  it('本文コンテナが無い（#intro 不在）実構造ページは空本文を返す', () => {
    const noIntro =
      '<div id="region-main"><div role="main"><div class="submissionstatustable">まだ提出されていません</div></div></div>'
    const body = parseAssignBody(noIntro)
    expect(body.description).toBe('')
    expect(body.attachments).toEqual([])
  })
})
