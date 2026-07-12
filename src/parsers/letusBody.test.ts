import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseAssignBody } from './letusBody'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(here, '__fixtures__', 'letus-assign-body.html'), 'utf8')

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
