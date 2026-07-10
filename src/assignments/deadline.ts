/**
 * 課題の締切に関する純粋ロジック（表示フォーマット・緊急度・並び替え・直近抽出）。
 * 課題タブとホームの「今やること」で共有する。端末非依存・now注入で決定論的（vitestでテスト可能）。
 */
import type { Assignment } from '../storage/assignmentsSerialize'

export type UrgencyTone = 'red' | 'amber' | 'green' | 'gray'

export const TONE_COLOR: Record<UrgencyTone, string> = {
  red: '#e0533a',
  amber: '#e8a400',
  green: '#0f9e75',
  gray: '#b8ccc3',
}

export function isSubmitted(a: Assignment): boolean {
  return a.submissionStatus === 'submitted' || a.submissionStatus === 'completed'
}

/** 'M/D HH:MM' 形式。締切なし・不正は「締切未設定」。 */
export function formatDeadline(iso: string | null): string {
  if (!iso) return '締切未設定'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '締切未設定'
  const mm = d.getMonth() + 1
  const dd = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

/** now基準の相対表示「あとN日/時間/分」。超過は「締切超過」、締切なしは空文字。 */
export function relDue(iso: string | null, now: Date): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sec = Math.floor((d.getTime() - now.getTime()) / 1000)
  if (sec <= 0) return '締切超過'
  const day = Math.floor(sec / 86400)
  if (day >= 1) return `あと${day}日`
  const h = Math.floor(sec / 3600)
  if (h >= 1) return `あと${h}時間`
  return `あと${Math.max(1, Math.floor(sec / 60))}分`
}

/** 締切順表示の緊急度トーン。提出済みはグレー、以降は締切までの時間で判定。 */
export function urgencyTone(a: Assignment, now: Date): UrgencyTone {
  if (isSubmitted(a)) return 'gray'
  if (!a.deadline) return 'green'
  const ms = new Date(a.deadline).getTime() - now.getTime()
  if (ms <= 24 * 3600 * 1000) return 'red'
  if (ms <= 7 * 24 * 3600 * 1000) return 'amber'
  return 'green'
}

/** null(締切未設定)は末尾、以外は締切の早い順（＝これから迫っている順）。 */
export function byDeadlineAsc(a: Assignment, b: Assignment): number {
  if (a.deadline === null && b.deadline === null) return a.title.localeCompare(b.title, 'ja')
  if (a.deadline === null) return 1
  if (b.deadline === null) return -1
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
}

/**
 * ホームの「今やること」向けに、最も締切が近い“これから迫る”未提出課題を1件返す。
 * 除外: 非表示 / 提出済み / 開始前(まだ受験できない) / 締切未設定 / 締切超過（アクション不能なものは出さない）。
 */
export function pickUrgentAssignment(list: Assignment[], now: Date): Assignment | null {
  const candidates = list.filter(
    (a) =>
      !a.ignored &&
      !isSubmitted(a) &&
      a.lifecycleStatus !== 'before_start' &&
      a.deadline !== null &&
      new Date(a.deadline).getTime() >= now.getTime(),
  )
  if (candidates.length === 0) return null
  return [...candidates].sort(byDeadlineAsc)[0]
}
