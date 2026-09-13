import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(relPath: string): string {
  return readFileSync(join(__dirname, '..', '..', relPath), 'utf8')
}

describe('規約文言の3者同期', () => {
  it('TERMS_BODYとterms-ja.mdの両方が、フィードバック送信の例外を明記している', () => {
    const appBody = readSource('src/screens/TermsConsentScreen.tsx')
    const docBody = readSource('docs/legal/terms-ja.md')
    for (const src of [appBody, docBody]) {
      expect(src).toMatch(/フィードバックを送る/)
      expect(src).toMatch(/学籍番号・氏名は含まれません/)
    }
  })

  it('自前バックエンドへ個人特定情報を送らない、という断定はもう単独では存在しない（例外句とセットになっている）', () => {
    const appBody = readSource('src/screens/TermsConsentScreen.tsx')
    const docBody = readSource('docs/legal/terms-ja.md')
    for (const src of [appBody, docBody]) {
      const idx = src.indexOf('利用者個人を特定できる形での情報の送信を行いません')
      expect(idx).toBeGreaterThan(-1)
      // 断定文の直後（200字以内）に例外句が来ることを確認する
      const around = src.slice(idx, idx + 200)
      expect(around).toMatch(/ただし/)
    }
  })
})
