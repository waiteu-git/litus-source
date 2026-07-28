import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseAssignBody } from './letusBody'

/** フィクスチャの採取元。添付の same-host 検証の基準になる。 */
const BASE = 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(here, '__fixtures__', 'letus-assign-body.html'), 'utf8')
const realFixture = readFileSync(join(here, '__fixtures__', 'letus-assign-body-real.html'), 'utf8')

describe('parseAssignBody', () => {
  it('#intro の説明本文を改行保持で抽出する', () => {
    const body = parseAssignBody(fixture, BASE)
    expect(body.description).toContain('第3回レポート課題です。')
    expect(body.description).toContain('次の設問に答えてください。')
    expect(body.description).toContain('分量は2ページ以内。')
    expect(body.description).toMatch(/課題です。\n次の設問/)
  })

  it('pluginfile 添付をURLでdedupして抽出する', () => {
    const body = parseAssignBody(fixture, BASE)
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].name).toBe('課題3_問題.pdf')
    expect(body.attachments[0].url).toContain('/pluginfile.php/')
  })

  it('intro も添付も無いHTML（ログイン等）は空を返す', () => {
    const body = parseAssignBody('<html><body><input type="password"></body></html>', BASE)
    expect(body.description).toBe('')
    expect(body.attachments).toEqual([])
  })
})

describe('parseAssignBody（実LETUS Moodle 4.x 構造）', () => {
  it('#intro が [role="main"] の外（#region-main 直下）でも本文を抽出する', () => {
    const body = parseAssignBody(realFixture, BASE)
    expect(body.description).toContain('次の設問に答えてください。')
    expect(body.description).toContain('設問1: 概要を200字で説明する。')
    expect(body.description).toContain('分量は2ページ以内。')
    // .no-overflow の本文のみ＝添付ファイル名や提出ファイル名は本文に混ざらない
    expect(body.description).not.toContain('課題4_問題.pdf')
    expect(body.description).not.toContain('my_submission.docx')
  })

  it('課題添付(introattachment)のみを添付として抽出し、提出ファイルは除外する', () => {
    const body = parseAssignBody(realFixture, BASE)
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].name).toBe('課題4_問題.pdf')
    expect(body.attachments[0].url).toContain('/mod_assign/introattachment/')
    // 学生の提出ファイル(#intro の外)は課題添付ではない
    expect(body.attachments.some((a) => a.url.includes('assignsubmission_file'))).toBe(false)
  })

  it('外部ホストの pluginfile 添付は落とす（Cookie共有WebViewで開かれるため・監査L-1）', () => {
    // 本文HTMLに書ける者（教員権限・LETUS側XSS）が仕込む想定。同一ホストの添付だけ残す。
    const html =
      '<div id="region-main"><div id="intro"><div class="no-overflow">本文</div>' +
      '<a href="https://evil.example.com/pluginfile.php/1/mod_assign/introattachment/0/x.pdf">わな.pdf</a>' +
      '<a href="https://letus.ed.tus.ac.jp/pluginfile.php/1/mod_assign/introattachment/0/ok.pdf">正規.pdf</a>' +
      '</div></div>'
    const body = parseAssignBody(html, BASE)
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].url).toContain('letus.ed.tus.ac.jp')
    expect(body.attachments.some((a) => a.url.includes('evil.example.com'))).toBe(false)
  })

  it('baseUrl が解釈不能なら添付を返さない（fail-closed・本文は返す）', () => {
    const html =
      '<div id="region-main"><div id="intro"><div class="no-overflow">本文だけは読める</div>' +
      '<a href="https://letus.ed.tus.ac.jp/pluginfile.php/1/mod_assign/introattachment/0/ok.pdf">正規.pdf</a>' +
      '</div></div>'
    const body = parseAssignBody(html, 'not a url')
    expect(body.description).toContain('本文だけは読める')
    expect(body.attachments).toEqual([])
  })

  it('相対URLの添付は baseUrl 基準で同一ホストとして残る', () => {
    const html =
      '<div id="region-main"><div id="intro"><div class="no-overflow">本文</div>' +
      '<a href="/pluginfile.php/1/mod_assign/introattachment/0/rel.pdf">相対.pdf</a></div></div>'
    const body = parseAssignBody(html, BASE)
    expect(body.attachments).toHaveLength(1)
  })

  it('本文コンテナが無い（#intro 不在）実構造ページは空本文を返す', () => {
    const noIntro =
      '<div id="region-main"><div role="main"><div class="submissionstatustable">まだ提出されていません</div></div></div>'
    const body = parseAssignBody(noIntro, BASE)
    expect(body.description).toBe('')
    expect(body.attachments).toEqual([])
  })
})
