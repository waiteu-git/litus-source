import type { SubmitDiag } from '../attendance/submitDiag'
import { formatSubmitDiag } from '../attendance/submitDiag'
import { formatDiagEnv, type DiagEnv } from './diagReport'

/**
 * フィードバック（不具合報告・要望）の種別・対象・純粋な整形ロジック（RN非依存・vitest対象）。
 *
 * 設計の正典＝ `docs/design/2026-09-13-feedback-selfhost-design.md`。
 * 送信先はletus-api（自前バックエンド・`POST /api/feedback`）で、失敗時のみ
 * `diagReport.ts`のmailto/コピー導線へフォールバックする。
 */

export type FeedbackKind = 'bug' | 'request'

/** kind='bug'の時だけ使う。requestは対象を問わない自由記述。 */
export type FeedbackTarget = 'attendance' | 'reaction' | 'timetable' | 'bulletin' | 'login' | 'other'

export const FEEDBACK_TARGET_LABEL: Record<FeedbackTarget, string> = {
  attendance: '出席',
  reaction: 'リアクションペーパー',
  timetable: '時間割',
  bulletin: '掲示',
  login: 'ログイン',
  other: 'その他',
}

/** letus-apiの`MAX_FEEDBACK_COMMENT_LENGTH`と同じ値。ここで打ち切ることで
 *  「この内容がそのまま送信されます」という画面表示を実際に真にする。 */
export const FEEDBACK_COMMENT_MAX_LENGTH = 4000

export type FeedbackDraft = {
  kind: FeedbackKind
  target: FeedbackTarget | null
  comment: string
  email: string
}

export type FeedbackEnvelope = {
  kind: FeedbackKind
  target: FeedbackTarget | null
  comment: string
  email: string | null
  diagsText: string | null
  notifLine: string | null
  env: DiagEnv
}

/** 診断記録（SubmitDiag）が存在するカテゴリだけ返す。それ以外はnull＝添付しない。 */
export function diagAttachTarget(target: FeedbackTarget | null): 'attendance' | 'reaction' | null {
  if (target === 'attendance') return 'attendance'
  if (target === 'reaction') return 'reaction'
  return null
}

/**
 * `SubmitDiag[]`は出席・リアペ共通の1つの店に同居している（`kind?: 'attendance'|'reaction'`）。
 * 既存データは`kind`未設定＝出席として扱う既存規約に合わせ、'attendance'側は`!== 'reaction'`で判定する。
 */
export function filterDiagsForTarget(diags: SubmitDiag[], target: FeedbackTarget | null): SubmitDiag[] {
  const attach = diagAttachTarget(target)
  if (attach === null) return []
  if (attach === 'reaction') return diags.filter((d) => d.kind === 'reaction')
  return diags.filter((d) => d.kind !== 'reaction')
}

// letus-api routes/feedback.js の EMAIL_RE と同一の正規表現。
// 意図的な重複＝2つの独立した入力ゲート（クライアント側は早期に気づかせるため、
// サーバー側は最終防御のため）。緩める時は両方を揃えること。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 送信ボタンの活性条件。問題なければnull、問題があればユーザーに見せるエラー文言を返す。 */
export function validateFeedbackDraft(draft: FeedbackDraft): string | null {
  if (draft.kind === 'bug' && draft.target === null) {
    return '対象を選んでください'
  }
  if (draft.comment.trim() === '') {
    return 'コメントを入力してください'
  }
  const email = draft.email.trim()
  if (email !== '' && !EMAIL_RE.test(email)) {
    return 'メールアドレスの形式が正しくありません'
  }
  return null
}

/** 入力欄のプレースホルダ。種別・対象ごとに書き方の手本を変える（1例を詳しく・複数並べない）。 */
export function feedbackPlaceholder(kind: FeedbackKind, target: FeedbackTarget | null): string {
  if (kind === 'request') {
    return '例: 時間割の画面にダークモードの配色を追加してほしいです'
  }
  if (target === 'attendance') {
    return '例: 7/30の2限で「出席する」を押したら「出席を確認しています…」から進まず、CLASSでは未出席でした'
  }
  if (target === 'reaction') {
    return '例: 7/30の2限でリアクションペーパーを提出しようとすると、送信ボタンを押しても画面が変わりません'
  }
  return '例: 7/30から、時間割の水曜だけ何も表示されません。前の週に戻すと出ます'
}

function feedbackKindLabel(kind: FeedbackKind): string {
  return kind === 'bug' ? '不具合報告' : 'ご要望'
}

/** 件名。フォールバック（mailto）でのみ使う。どの種別・ビルドからの報告かが分かるようにする。 */
export function buildFeedbackSubject(kind: FeedbackKind, env: DiagEnv): string {
  const build = env.buildNumber != null && String(env.buildNumber).trim() !== '' ? String(env.buildNumber).trim() : '?'
  return `リタスの${feedbackKindLabel(kind)}（build ${build}）`
}

/** 診断記録を人が読める形へ整形する。0件はnull（本文に「■ 診断記録」節を出さないため）。 */
export function formatDiagsText(diags: SubmitDiag[]): string | null {
  if (diags.length === 0) return null
  return diags.map((d, i) => `--- ${i + 1} ---\n${formatSubmitDiag(d)}`).join('\n\n')
}

/**
 * 送信前プレビュー・フォールバック時のmailto本文の両方に使う人間可読テキスト。
 * 「見せてから送る」原則＝これがそのまま（プレビューでは画面に、フォールバックでは実際に）送られる。
 */
export function buildFeedbackPreviewText(envelope: FeedbackEnvelope): string {
  const head = [
    `■ 種別: ${feedbackKindLabel(envelope.kind)}${envelope.target ? `（${FEEDBACK_TARGET_LABEL[envelope.target]}）` : ''}`,
    '',
    '■ 内容',
    envelope.comment,
    '',
    '■ アプリ・端末',
    formatDiagEnv(envelope.env),
    ...(envelope.notifLine ? [envelope.notifLine] : []),
  ]
  const records = envelope.diagsText ? ['', '■ 診断記録', envelope.diagsText] : []
  const email = envelope.email ? ['', `■ 返信用メールアドレス: ${envelope.email}`] : []
  return [...head, ...records, ...email].join('\n')
}

/** letus-apiへ送るJSONペイロード。`POST /api/feedback`が期待する形（letus-api側プランと一致させる）。 */
export function buildFeedbackRequestBody(envelope: FeedbackEnvelope): Record<string, unknown> {
  return {
    kind: envelope.kind,
    target: envelope.target,
    comment: envelope.comment,
    email: envelope.email ?? '',
    diagsText: envelope.diagsText,
    notifLine: envelope.notifLine,
    env: envelope.env,
  }
}
