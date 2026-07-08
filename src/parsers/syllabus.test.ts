import { describe, expect, it } from 'vitest'
import { parseSyllabus } from './syllabus'

// 実HTML（SyllabusHtml.2026.9973515.html）の構造を縮約したフィクスチャ。
const FIXTURE = `
<html><head><title>
線形代数学１ （１組） ｜ シラバス情報
</title></head><body>
<div class="syllabusArea">
  <div class="rowStyle rowMargin">
    <div class="colHeader colStyle colBorder" style="width:22%;">科目授業名称（和文）　Name</div>
    <div class="colStyle colBorder" style="width:78%;"><div>線形代数学１ （１組）</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="colHeader colStyle colBorder" style="width:22%;">授業コード　Class code</div>
    <div class="colStyle colBorder" style="width:28%;"><div>9973515</div></div>
    <div class="colHeader colStyle colBorder" style="width:22%;">科目番号　Course number</div>
    <div class="colStyle colBorder" style="width:28%;"><div>73MAALG101</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="colHeader colStyle colBorder" style="width:22%;">概要　Description</div>
    <div class="colStyle colBorder" style="width:78%;"><div>線形代数は重要である。<br>統計も扱う。</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="colHeader colStyle colBorder" style="width:100%;">教科書　Textbooks/Readings</div>
  </div>
</div></body></html>`

describe('parseSyllabus', () => {
  const parsed = parseSyllabus(FIXTURE)

  it('タイトルを科目名から取る（｜以降を除去）', () => {
    expect(parsed.title).toBe('線形代数学１ （１組）')
  })
  it('ラベルと値をペアにする', () => {
    const desc = parsed.rows.find((r) => r.label.includes('概要'))
    expect(desc?.value).toBe('線形代数は重要である。\n統計も扱う。')
  })
  it('1行の2ペア（コード＋科目番号）を両方拾う', () => {
    expect(parsed.rows.find((r) => r.label.includes('授業コード'))?.value).toBe('9973515')
    expect(parsed.rows.find((r) => r.label.includes('科目番号'))?.value).toBe('73MAALG101')
  })
  it('値のないラベルはセクション見出し（value空）', () => {
    const tb = parsed.rows.find((r) => r.label.includes('教科書'))
    expect(tb).toBeTruthy()
    expect(tb?.value).toBe('')
  })
})
