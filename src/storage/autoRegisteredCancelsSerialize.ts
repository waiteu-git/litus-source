/**
 * 自動登録済み休講スロットキーの台帳の直列化（純粋・RN非依存）。
 *
 * raw===null（キー未初期化＝211へ上げた直後の全端末）は「有効な空配列」として扱う
 * （設計 §3 Q1: 台帳が空の状態からの自動登録は、一度だけの再登録を受け入れる設計判断）。
 * 一方、raw は存在するのに中身が壊れている（JSON不正／配列でない）場合は null を返す。
 * 呼び出し側はこの null を「読めない＝自動登録しない」に倒すこと（設計 禁止事項4）。
 * ⚠ [] と null を混同しない＝どちらも「空」に見えるが意味が違う。
 */
export function serializeAutoRegisteredCancelKeys(keys: string[]): string {
  return JSON.stringify(keys)
}

export function deserializeAutoRegisteredCancelKeys(raw: string | null): string[] | null {
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed.filter((v): v is string => typeof v === 'string')
}
