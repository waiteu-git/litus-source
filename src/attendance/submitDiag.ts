import type { SubmitResult } from './engine'

/**
 * 出席送信の診断記録と、安全な自動再送の判定（純粋・RN非依存）。
 *
 * 背景: 出席の自動送信は実機で**間欠的に**登録されないことがあり（2026-07-16）、
 * リアペ待ち／確認ダイアログ／遷移によるXHRキャンセル／複数行誤送信／学外IP制限の
 * 各仮説はいずれもユーザー確認・実証で否定済み。真因は未特定のまま再現待ちだが、
 * 「次に失敗した瞬間を捕まえる」前提は脆い（授業中に診断を撮る余裕がない・気づかず流す）。
 * よって **①診断を端末に貯めて後から見返せるようにし、②原因が分からなくても無害化する**。
 */

/** 1回の送信の診断（原因特定用。認証コードそのものは記録しない）。 */
export type SubmitDiag = {
  /**
   * 何の送信か。省略時は出席コード送信（既存の保存データとの後方互換）。
   * リアペ提出も同じ記録に混ぜる＝ユーザーは設定の1箇所を見ればよく、テスターへの依頼も変わらない。
   */
  kind?: 'attendance' | 'reaction'
  /** 送信時刻（ISO）。 */
  at: string
  courseName: string | null
  /** 自動再送で解決したか等の注記。 */
  note?: string
  ok: boolean
  wrong: boolean
  err: boolean
  result: string
  btnFound?: boolean
  method?: string
  /** 入力できた桁数（内容は記録しない）。 */
  filled?: number
  ajaxFired?: boolean
  ajaxDone?: boolean
  ajaxStatus?: number
  ajaxError?: string
  hint?: string
}

/** 保持する件数（直近ぶんだけ。無制限に貯めない）。 */
export const SUBMIT_DIAG_MAX = 10

/** 自動再送の上限（1回だけ）。何度も撃たない。 */
export const SUBMIT_MAX_RETRY = 1

/** 新しい記録を先頭に足し、上限で打ち切る（新しい順）。 */
export function appendSubmitDiag(list: SubmitDiag[], entry: SubmitDiag, max = SUBMIT_DIAG_MAX): SubmitDiag[] {
  return [entry, ...list].slice(0, Math.max(1, max))
}

/** SubmitResult＋文脈から診断レコードを作る（純粋・nowIsoは注入）。 */
export function toSubmitDiag(
  r: SubmitResult,
  ctx: { nowIso: string; courseName: string | null; note?: string },
): SubmitDiag {
  return {
    at: ctx.nowIso,
    courseName: ctx.courseName,
    note: ctx.note,
    ok: r.ok,
    wrong: r.wrong,
    err: r.err,
    result: r.result,
    btnFound: r.btnFound,
    method: r.method,
    filled: r.filled,
    ajaxFired: r.ajaxFired,
    ajaxDone: r.ajaxDone,
    ajaxStatus: r.ajaxStatus,
    ajaxError: r.ajaxError,
    hint: r.hint,
  }
}

/**
 * 自動再送してよいか。
 *
 * **`ajaxError` が来た時だけ**＝送信リクエストがCLASSに到達していないと確定した場合に限る。
 * 到達していない以上、再送しても二重登録にならない（これが安全に自動回復できる根拠）。
 * 「応答は返ったが出席済みにならない」ケースは到達済みかもしれず曖昧なので**再送しない**
 * （別授業への誤送信・二重登録のリスクを、得られるものに見合わず抱え込まないため）。
 */
export function shouldAutoRetrySubmit(opts: {
  result: SubmitResult
  /** これまでの自動再送回数。 */
  tries: number
  /** CLASSが出席済みを示しているか。 */
  attended: boolean
  /** 再送に使えるコードを保持しているか。 */
  hasCode: boolean
  max?: number
}): boolean {
  const { result, tries, attended, hasCode } = opts
  const max = opts.max ?? SUBMIT_MAX_RETRY
  if (attended || !hasCode) return false
  if (result.ok || result.wrong) return false // 成功・コード誤りは再送しても無意味
  if (!result.ajaxError) return false // 到達したかもしれない＝再送しない
  return tries < max
}

/** 記録を人が読める1行にする（設定画面での表示・コピー用）。 */
export function formatSubmitDiag(d: SubmitDiag): string {
  const isReaction = d.kind === 'reaction'
  // リアペは出席コード送信と一目で区別できるようにする（同じ記録に混在するため）。
  const label = isReaction ? '[リアペ] ' : ''
  const head = `${label}${d.at}${d.courseName ? ` ${d.courseName}` : ''}${d.note ? `（${d.note}）` : ''}`
  const verdict = d.ok ? 'OK' : d.wrong ? 'コード誤り' : d.err ? 'エラー' : '未確定'
  const ajax = `発火=${String(d.ajaxFired)} 応答=${String(d.ajaxDone)} status=${d.ajaxStatus ?? '-'}${d.ajaxError ? ` err=${d.ajaxError}` : ''}`
  // リアペは「入力=N桁」ではなく本文の文字数。ボタン/method は出席送信側の観測項目なので出さない。
  const meta = isReaction
    ? `本文=${d.filled ?? '-'}文字`
    : `btn=${String(d.btnFound)} method=${d.method ?? '-'} 入力=${d.filled ?? '-'}桁`
  return [head, `${verdict}: ${d.result}`, ajax, meta, d.hint ? `CLASS: ${d.hint}` : '']
    .filter(Boolean)
    .join('\n')
}
