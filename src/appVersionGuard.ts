/**
 * 廃止APIのメンバ式がソースに残っていないかを見る純マッチャ。React Native 非依存。
 * 何を廃止扱いにするかは呼び出し側（`appVersion.test.ts`）が渡す＝
 * **このファイル自身に廃止APIの文字列を置かない**（置くと自分がラチェットに引っかかる）。
 *
 * 除外は「コメント行に `// ratchet-allow` がある場合」だけ。`src/ui/rawColorGuard.ts` の
 * `// design-allow` に倣うが、あちらと違い**実コード行には効かせない**。
 * 廃止APIをコードから読む正当な理由は定義上ゼロなので、マーカーで実コードを通せると
 * 誤ALLOW（＝ラチェットが存在する理由そのものを取りこぼす）の口を開けることになる。
 * コメント行に限れば、この除外はガードを一切弱めない。
 */
const ALLOW_MARKER = '// ratchet-allow'

/** 行頭が `//` / `*` / `/*` ＝コメント行。実コード行にこの形は現れない。 */
function isCommentLine(line: string): boolean {
  const t = line.trimStart()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

export function findDeadApiUsages(text: string, apis: readonly string[]): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (isCommentLine(line) && line.includes(ALLOW_MARKER)) continue
    for (const api of apis) {
      if (line.includes(api)) out.push(api)
    }
  }
  return out
}
