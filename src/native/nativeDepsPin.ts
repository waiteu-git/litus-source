/**
 * 完全固定するネイティブ依存の検査（純粋ロジック・依存ゼロ）。
 * 呼び出し元は src/native/nativeDepsPinned.test.ts（固定ラチェット T1）だけ。アプリからは import しない。
 *
 * lockfile は YAML パーサを使わず行の正規表現で読む。YAML パーサを devDependencies に足すと、
 * それ自体が lockfile の差分になり「lockfile の差分は2パッケージの追加だけ」を崩すため
 * （docs/design/2026-09-12-v11-train1-NATIVE.md §7 T1）。
 */

/** 範囲記号の無い完全な版（`57.0.1`、任意で `-rc.1` などのプレリリース）なら真。 */
export function isExactVersion(spec: string): boolean {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(spec)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 最上位の見出し（字下げの無い `name:` 行）から次の最上位の見出しまでの本文。無ければ空文字。 */
function topSection(lock: string, name: string): string {
  const lines = lock.split(/\r?\n/)
  const start = lines.indexOf(`${name}:`)
  if (start < 0) return ''
  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break
    body.push(lines[i])
  }
  return body.join('\n')
}

/** importers にある `pkg` の specifier（引用符は外す）。無ければ null。 */
export function importerSpecifierOf(lock: string, pkg: string): string | null {
  const re = new RegExp(`^ {6}'?${escapeRegExp(pkg)}'?:\\n {8}specifier: (.+)$`, 'm')
  const m = re.exec(topSection(lock, 'importers'))
  return m ? m[1].trim().replace(/^'(.*)'$/, '$1') : null
}

/** packages にある `pkg@<版>:` の版の一覧（解決された実体の数だけ並ぶ）。 */
export function lockPackageVersionsOf(lock: string, pkg: string): string[] {
  const re = new RegExp(`^ {2}'?${escapeRegExp(pkg)}@([^:(']+)'?:$`, 'gm')
  const body = topSection(lock, 'packages')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) out.push(m[1])
  return out
}

/**
 * package.json と lockfile が pins（パッケージ名→版）の完全固定を満たすか。
 * 満たさない理由を1件1行で返す（空配列＝満たす）。
 */
export function pinViolations(
  packageJson: { dependencies?: Record<string, string> },
  lock: string,
  pins: Readonly<Record<string, string>>,
): string[] {
  const out: string[] = []
  for (const [name, version] of Object.entries(pins)) {
    const spec = packageJson.dependencies?.[name]
    if (spec === undefined) out.push(`${name}: package.json の dependencies に無い`)
    else if (!isExactVersion(spec)) out.push(`${name}: package.json が範囲指定 ${spec}（固定値 ${version} を範囲記号なしで書く）`)
    else if (spec !== version) out.push(`${name}: package.json が ${spec}（固定値は ${version}）`)
    const lockSpec = importerSpecifierOf(lock, name)
    if (lockSpec !== version) out.push(`${name}: lockfile の specifier が ${lockSpec ?? '無し'}（固定値は ${version}）`)
    const resolved = lockPackageVersionsOf(lock, name)
    if (resolved.length !== 1 || resolved[0] !== version) {
      out.push(`${name}: lockfile の解決版が [${resolved.join(', ')}]（固定値 ${version} の1件だけのはず）`)
    }
  }
  return out
}
