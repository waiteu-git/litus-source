import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TERMS_VERSION } from './termsVersion'

function readSource(relPath: string): string {
  return readFileSync(join(__dirname, '..', '..', relPath), 'utf8')
}

/** 指定テキストの行の中から、両方の語を含む1行を探す。見つからなければ例外＝検査自体が無言でパスしない。 */
function findLineContaining(text: string, needles: readonly string[]): string {
  const line = text.split('\n').find((l) => needles.every((n) => l.includes(n)))
  if (line === undefined) {
    throw new Error(`該当行が見つからない（探した語: ${needles.join(' / ')}）`)
  }
  return line
}

/** Markdownの装飾（太字・インラインコード）と箇条書き記号だけを落とす。本文の言い回しは変えない。 */
function stripMarkdownDecoration(line: string): string {
  return line
    .replace(/^[-・]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
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

  it('自前バックエンド送信の例外条項（送信される項目の列挙）が、書式差分を除いてTERMS_BODYとterms-ja.mdで完全一致する', () => {
    // 通信先条項は他の説明と違い言い回しの言い換えを許さない＝ここに列挙されるのが
    // 「実際に送っている項目の一覧」そのものであるため、片方だけ更新されるドリフトを
    // 検出できるよう完全一致で縛る（他の箇条書きは意訳を許容するのでここだけ狙う）。
    const appBody = readSource('src/screens/TermsConsentScreen.tsx')
    const docBody = readSource('docs/legal/terms-ja.md')
    const needles = ['本アプリは、自前バックエンド', 'フィードバックを送る']
    const appClause = stripMarkdownDecoration(findLineContaining(appBody, needles))
    const docClause = stripMarkdownDecoration(findLineContaining(docBody, needles))
    expect(appClause).toBe(docClause)
  })

  it('TERMS_VERSIONが、アプリ内の定数とterms-ja.mdの版番号で一致する', () => {
    const docBody = readSource('docs/legal/terms-ja.md')
    const match = docBody.match(/版（TERMS_VERSION）:\s*\*\*(\d+)\*\*/)
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBe(TERMS_VERSION)
  })
})
