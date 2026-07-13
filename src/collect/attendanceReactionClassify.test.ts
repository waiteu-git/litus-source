import { describe, expect, it } from 'vitest'
import { parse, type HTMLElement } from 'node-html-parser'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseAttendanceMessage, type AttendanceReception } from './attendanceMessage'

/**
 * 実DOM回帰（リアペ必須授業・2026-07-13採取）: 出席カードの3状態fixtureに対し、
 * sensor（DETECT_ATTENDANCE_JS）と同じ抽出をして parseAttendanceMessage に通し、
 * 分類が固定されることを担保する（fixture→payload→status のE2E回帰）。
 *   ① pending（コード送信後・リアペ未提出）→ reaction_pending
 *   ③ submitted（リアペ提出済み）        → attended（既存 .attendSuc 検知のまま）
 *   既存 accepting（受付中・未提出）      → accepting（不変）
 * 判定はクラス＋テキストのみ（j_idt系IDは自動採番で不安定なため使わない）。
 */

function load(name: string): HTMLElement {
  return parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf-8'))
}

/** DETECT_ATTENDANCE_JS が postMessage する payload をfixtureから再現する（同じセレクタ・同じ規則）。 */
function sensorPayload(root: HTMLElement): string {
  const body = root.text
  const timeRe = /^\d{1,2}:\d{2}\s*[～~〜]\s*\d{1,2}:\d{2}$/
  const courseName =
    root
      .querySelectorAll('.sizeBig')
      .map((e) => (e.text ?? '').replace(/\s+/g, ' ').trim())
      .find((t) => t && !timeRe.test(t)) ?? ''
  const signSize = root.querySelector('.signSize')?.text ?? ''
  const attendSuc = !!root.querySelector('.attendSuc')
  const hasVerif = root.querySelectorAll('input.verification').length > 0
  const hasSubmitBtn = root
    .querySelectorAll('button,input[type=submit],a')
    .some((b) => (b.text ?? '').replace(/\s+/g, '').includes('出席登録する'))
  const hasCodeInput = hasVerif || hasSubmitBtn || body.includes('認証コード')
  const flg = root.querySelector('.signFlging')?.text ?? ''
  let signEnded = /終了/.test(flg)
  const tsText = root.querySelector('.timeSum')?.text
  let timeSum: number | null = null
  if (tsText != null) {
    const n = parseInt(tsText.replace(/[^0-9-]/g, ''), 10)
    if (!Number.isNaN(n)) timeSum = n
  }
  if (timeSum !== null && timeSum <= 0) signEnded = true
  const reactionMsg = root
    .querySelectorAll('.reactionMsg')
    .map((e) => e.text ?? '')
    .join(' ')
  return JSON.stringify({
    type: 'attendance',
    text: body,
    courseName,
    signSize,
    attendSuc,
    hasCodeInput,
    signEnded,
    timeSum,
    reactionMsg,
  })
}

function classify(fixture: string): AttendanceReception {
  return parseAttendanceMessage(sensorPayload(load(fixture)))
}

describe('リアペ出席の実DOM分類回帰（fixture→sensor→classify）', () => {
  it('① コード送信後・リアペ未提出 → reaction_pending', () => {
    const r = classify('attendance-reaction-pending-real.html')
    expect(r.status).toBe('reaction_pending')
    expect(r.accepting).toBe(false)
    expect(r.confirmWindow).toBe('12:50〜14:30')
    expect(r.error).toBeNull()
  })

  it('③ リアペ提出済み → attended（既存 .attendSuc 検知のまま・追加実装不要）', () => {
    const r = classify('attendance-reaction-submitted-real.html')
    expect(r.status).toBe('attended')
    expect(r.confirmWindow).toBe('12:50〜14:30')
  })

  it('既存 受付中（未提出・リアペ無し授業）→ accepting 不変', () => {
    const r = classify('attendance-accepting-real.html')
    expect(r.status).toBe('accepting')
    expect(r.accepting).toBe(true)
    expect(r.courseName).toBe('線形代数学１ （１組）')
    expect(r.confirmWindow).toBe('10:20〜12:00')
  })
})

describe('リアペfixtureのセレクタ番人（sensorが依存するクラス・文言）', () => {
  it('①: .attendSuc 無し・.reactionMsg 2枚（未完了文言）・verification欄と出席登録するボタンが消える', () => {
    const root = load('attendance-reaction-pending-real.html')
    expect(root.querySelector('.attendSuc')).toBeNull()
    const msgs = root.querySelectorAll('.reactionMsg').map((e) => e.text)
    expect(msgs).toHaveLength(2)
    expect(msgs.join(' ')).toContain('完了していません')
    expect(msgs.join(' ')).toContain('提出してください')
    expect(root.querySelectorAll('input.verification')).toHaveLength(0)
    expect(root.querySelectorAll('button').some((b) => (b.text ?? '').includes('出席登録する'))).toBe(false)
    // 遷移ボタンはテキスト「リアクションペーパー」で引ける（idは不安定）
    expect(root.querySelectorAll('button').some((b) => (b.text ?? '').trim() === 'リアクションペーパー')).toBe(true)
  })

  it('③: .attendSuc「出席」と .reactionMsg「リアクションペーパー提出済み」が同時に付く', () => {
    const root = load('attendance-reaction-submitted-real.html')
    expect(root.querySelector('.attendSuc')?.text).toBe('出席')
    expect(root.querySelector('.reactionMsg')?.text).toBe('リアクションペーパー提出済み')
  })
})
