import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(relPath: string): string {
  return readFileSync(join(__dirname, '..', '..', relPath), 'utf8')
}

describe('FeedbackSheet.tsx の配線', () => {
  const src = readSource('src/report/FeedbackSheet.tsx')

  it('種別（不具合・要望）の両方を選べる', () => {
    expect(src).toContain("key: 'bug'")
    expect(src).toContain("key: 'request'")
  })

  it('対象6種すべてを選べる', () => {
    for (const target of ['attendance', 'reaction', 'timetable', 'bulletin', 'login', 'other']) {
      expect(src).toContain(`'${target}'`)
    }
  })

  it('letus-apiへ送信する（submitFeedbackを呼ぶ）', () => {
    expect(src).toContain('submitFeedback(')
  })

  it('送信失敗時にmailto/コピーのフォールバックを持つ', () => {
    expect(src).toContain('buildMailtoUrl(')
    expect(src).toContain('Clipboard.setString(')
  })

  it('送信前にプレビュー本文を表示する（見せてから送る原則）', () => {
    expect(src).toContain('buildFeedbackPreviewText(')
  })

  it('返信用メールアドレスの入力欄を持つ', () => {
    expect(src).toMatch(/返信用メールアドレス/)
  })
})

describe('呼び出し元の配線', () => {
  it('AttendanceScreen.tsxはDiagReportSheetでなくFeedbackSheetを使う', () => {
    const src = readSource('src/screens/AttendanceScreen.tsx')
    expect(src).not.toContain('DiagReportSheet')
    expect(src).toContain('FeedbackSheet')
  })

  it('SettingsScreen.tsxはDiagReportSheetでなくFeedbackSheetを使う', () => {
    const src = readSource('src/screens/SettingsScreen.tsx')
    expect(src).not.toContain('DiagReportSheet')
    expect(src).toContain('FeedbackSheet')
  })

  it('設定側は「不具合の報告」のAccordionでなくLinkRowで開く', () => {
    const src = readSource('src/screens/SettingsScreen.tsx')
    expect(src).not.toContain('title="不具合の報告"')
    expect(src).toMatch(/title="フィードバックを送る"/)
  })

  it('DiagReportSheet.tsxはもう存在しない', () => {
    expect(() => readSource('src/report/DiagReportSheet.tsx')).toThrow()
  })
})
