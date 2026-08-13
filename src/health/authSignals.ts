/**
 * 収集WebView から届く認証シグナル（injectedScripts の `litusAuthProbe()` の戻り値）の読み取り。
 * 純粋・RN非依存。
 *
 * WebView の postMessage は外部由来の文字列なので、形が違えば **黙って null に倒す**
 * （報告なし＝呼び出し側は従来どおり HTML から推定する）。部分的に壊れた報告を
 * 「false の報告」として扱うと、健全なページを未ログイン扱いしかねないため、
 * 両フィールドが boolean で揃っているときだけ採用する。
 */

import type { PageAuthSignals } from './scanDiagnostics'

export function readAuthSignals(raw: unknown): PageAuthSignals | null {
  if (raw === null || typeof raw !== 'object') return null
  const { hasMcfg, loggedIn } = raw as { hasMcfg?: unknown; loggedIn?: unknown }
  if (typeof hasMcfg !== 'boolean' || typeof loggedIn !== 'boolean') return null
  return { hasMcfg, loggedIn }
}
