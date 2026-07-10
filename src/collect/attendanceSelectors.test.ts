import { describe, expect, it } from 'vitest'
import { parse } from 'node-html-parser'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 実DOM回帰: モバイル出席登録ページ（受付中・未提出 2026-07-10実測）の抜粋に対し、
 * sensor（DETECT_ATTENDANCE_JS）が依存する**セレクタ**が解決することを担保する。
 * これが壊れると出席の検出が黙って失敗するため、実サイトのDOM変更を検知する番人。
 * （送信 actuator は attendanceSubmit.private の非公開実装側。公開版はスタブ。）
 */
const html = readFileSync(
  fileURLToPath(new URL('./__fixtures__/attendance-accepting-real.html', import.meta.url)),
  'utf-8',
)
const root = parse(html)

describe('出席ページの実DOMセレクタ', () => {
  it('認証コード欄 input.verification が4箱', () => {
    expect(root.querySelectorAll('input.verification')).toHaveLength(4)
  })
  it('科目名は .sizeBig のうち時刻でない方（時刻と科目名が同クラス）', () => {
    const timeRe = /^\d{1,2}:\d{2}\s*[～~〜]\s*\d{1,2}:\d{2}$/
    const name = root
      .querySelectorAll('.sizeBig')
      .map((e) => (e.text ?? '').replace(/\s+/g, ' ').trim())
      .find((t) => t && !timeRe.test(t))
    expect(name).toBe('線形代数学１ （１組）')
  })
  it('受付時間 label.signSize が「出席確認時間：HH:MM～HH:MM」', () => {
    const t = root.querySelector('.signSize')?.text ?? ''
    expect(t).toContain('10:20')
    expect(t).toContain('12:00')
  })
  it('受付状態 label.signFlging（受付中は「出席確認中」）', () => {
    expect(root.querySelector('.signFlging')?.text ?? '').toContain('出席確認中')
  })
  it('残り秒 label.timeSum が数値', () => {
    expect(Number((root.querySelector('.timeSum')?.text ?? '').replace(/[^0-9-]/g, ''))).toBeGreaterThan(0)
  })
  it('未提出なので .attendSuc は無い', () => {
    expect(root.querySelector('.attendSuc')).toBeNull()
  })
  it('「出席登録する」ボタンが存在', () => {
    const btn = root.querySelectorAll('button').find((b) => (b.text ?? '').replace(/\s+/g, '').includes('出席登録する'))
    expect(btn).toBeTruthy()
  })
})
