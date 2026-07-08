/**
 * LETUSアクティビティURLの同一性キー。`/mod/<type>/view.php?id=<n>` の <type> と <n> で
 * 同定する。リダイレクトやクエリ順・追加パラメータの揺らぎに強くするため、パス全体やクエリ
 * 全体ではなく mod種別＋id だけで比較する。判定できないURLは正規化した文字列を返す。
 */
export function letusActivityKey(url: string): string {
  const mod = url.match(/\/mod\/([a-z]+)\//i)
  const id = url.match(/[?&]id=(\d+)/)
  if (mod && id) return `${mod[1].toLowerCase()}:${id[1]}`
  // それ以外はクエリ/ハッシュを落として素朴に正規化
  return url.split('#')[0].split('?')[0]
}

/** url が tracked のいずれかと同じアクティビティを指すか。 */
export function isSameTrackedActivity(url: string, tracked: Iterable<string>): boolean {
  const k = letusActivityKey(url)
  for (const t of tracked) {
    if (letusActivityKey(t) === k) return true
  }
  return false
}
