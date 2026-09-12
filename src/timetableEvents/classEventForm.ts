/**
 * 予定フォーム（ClassEventFormScreen）の保存の組み立て。React Native 非依存・now 注入＝vitest で固定できる。
 * 画面の onSave にあった組み立てを1バイトも変えずに移した（設計 docs/design/2026-09-12-v11-train1-A.md §4-4）。
 * 保存の後ろ（upsert → bump → 通知の再予約 → 戻る）と削除は画面に残す。
 */
import {
  makeClassEventId,
  type ClassEvent,
  type ClassEventType,
  type CountdownStart,
  type ExamLeadDays,
  type MakeupStatus,
} from './classEvent'
import { isValidHm, isValidYmd, ymdToDate } from './eventDateValue'
import type { ExamCountdownStartSetting } from '../storage/displaySettingsSerialize'

/** 画面の入力状態（ClassEventFormScreen の useState）と、ルート引数の科目名・科目コード・編集中の id。 */
export type ClassEventFormInput = {
  /** 編集中の予定の id。新規は undefined（id は now と内容から作る）。 */
  editId: string | undefined
  courseName: string
  courseCode: string | null
  type: ClassEventType
  date: string
  periods: number[]
  room: string
  note: string
  makeupStatus: MakeupStatus
  mkDate: string
  mkPeriods: number[]
  mkRoom: string
  /** 試験の表示開始の入力。種類が試験の時だけ保存に使う（必須＝画面が渡し忘れると tsc が止める）。 */
  countdown: CountdownFormValue
}

/**
 * フォームの値から保存する ClassEvent を組み立てる。検査（日付・時限・補講）は呼び出し側で済ませてから呼ぶ。
 * createdAt は編集でも now で上書きする（現行挙動。直すのは範囲外＝設計 A §2）。
 */
export function buildClassEventFromForm(input: ClassEventFormInput, now: Date): ClassEvent {
  const { editId, courseName, courseCode, type, date, periods, room, note, makeupStatus, mkDate, mkPeriods, mkRoom } = input
  const id = editId ?? makeClassEventId({ createdAt: now.toISOString(), courseName, type, date })
  const ev: ClassEvent = {
    id,
    courseName,
    courseCode,
    type,
    date,
    periods,
    room: type === 'roomChange' || type === 'makeup' ? room.trim() || null : null,
    note: note.trim() || null,
    createdAt: now.toISOString(),
  }
  if (type === 'cancel') {
    ev.makeupStatus = makeupStatus
    ev.makeup = makeupStatus === 'has' ? { date: mkDate, periods: mkPeriods, room: mkRoom.trim() || null } : null
  }
  // 試験の時だけ付ける（休講の時だけ補講を付けるのと同じ形）。種類を試験以外へ変えて保存したら付けない。
  if (isExamType(type)) {
    const cs = countdownStartFromForm(input.countdown)
    if (cs) ev.countdownStart = cs
  }
  return ev
}

/** 表示開始を持てる種類（試験）。カウントダウンの対象（examCountdown.ts の EXAM_TYPES）と同じ3種＝テストで一致を確かめている。 */
export function isExamType(t: ClassEventType): boolean {
  return t === 'quiz' || t === 'midterm' || t === 'final'
}

/** フォームの表示開始の選択。'inherit'＝全体の設定に従う（フィールドを付けない）。 */
export type CountdownChoice = 'inherit' | ExamLeadDays | 'at'
/** チップの並び（設計 A §9-1）。 */
export const COUNTDOWN_CHOICES: readonly CountdownChoice[] = ['inherit', 60, 30, 14, 7, 'at']
/** 表示開始の入力状態。date/time は「日時を指定」でだけ使う（ローカルの 'YYYY-MM-DD'・'HH:mm'。未選択は ''）。 */
export type CountdownFormValue = { choice: CountdownChoice; date: string; time: string }
export const EMPTY_COUNTDOWN_FORM: CountdownFormValue = { choice: 'inherit', date: '', time: '' }

export const COUNTDOWN_DATE_REQUIRED = '表示を始める日付を選んでください'
export const COUNTDOWN_DATE_AFTER_EXAM = '表示を始める日は試験日より後にできません'

/** 全体の設定の言い方（「全体の設定に従う（いま：○○）」の○○）。 */
export function startSettingLabel(s: ExamCountdownStartSetting): string {
  return s === 'always' ? 'いつでも' : `${s}日前から`
}

/** チップの文言（設計 A §9-1）。 */
export function countdownChoiceLabel(c: CountdownChoice, globalSetting: ExamCountdownStartSetting): string {
  if (c === 'inherit') return `全体の設定に従う（いま：${startSettingLabel(globalSetting)}）`
  if (c === 'at') return '日時を指定'
  return `${c}日前から`
}

/** 編集読み込み: 保存済みの表示開始をフォームの値へ戻す（無い＝全体の設定に従う）。 */
export function countdownFormFromEvent(e: ClassEvent): CountdownFormValue {
  const cs = e.countdownStart
  if (!cs) return EMPTY_COUNTDOWN_FORM
  if (cs.kind === 'days') return { choice: cs.days, date: '', time: '' }
  return { choice: 'at', date: cs.date, time: cs.time }
}

/**
 * 保存: フォームの値から表示開始を作る。null＝フィールドを付けない（全体の設定に従う）。
 * 時刻を選んでいなければ 00:00（設計 A §9-2）。日付の無い「日時を指定」は作らない（検査で止まる値）。
 */
export function countdownStartFromForm(v: CountdownFormValue): CountdownStart | null {
  if (v.choice === 'inherit') return null
  if (v.choice === 'at') {
    if (!isValidYmd(v.date)) return null
    return { kind: 'at', date: v.date, time: isValidHm(v.time) ? v.time : '00:00' }
  }
  return { kind: 'days', days: v.choice }
}

/**
 * 保存時の検査（既存の日付・時限・補講の検査の後に呼ぶ）。エラーの文言か null。
 * 種類が試験以外なら検査しない（「日時を指定」のまま種類を休講へ変えても保存できる＝フィールドは付かない）。
 * 試験日と同じ日は通す。過去の日時も通す（すぐ出るだけ）。examDate は検査済みの 'YYYY-MM-DD'。
 */
export function validateCountdownForm(type: ClassEventType, examDate: string, v: CountdownFormValue): string | null {
  if (!isExamType(type) || v.choice !== 'at') return null
  if (!isValidYmd(v.date)) return COUNTDOWN_DATE_REQUIRED
  if (v.date > examDate) return COUNTDOWN_DATE_AFTER_EXAM
  return null
}

/** ピッカーの初期値。日付が無ければ今日、時刻が無ければ 0:00。 */
export function countdownPickerValue(v: CountdownFormValue, now: Date): Date {
  const d = ymdToDate(v.date, now)
  if (isValidHm(v.time)) {
    const [h, m] = v.time.split(':').map(Number)
    d.setHours(h, m, 0, 0)
  }
  return d
}

/** Date → ローカルの 'HH:mm'（時刻ピッカーの確定値を保存の形へ）。 */
export function dateToHm(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
