/**
 * 第三者の商標ロゴが紛れ込んでいないことのラチェット。
 *
 * 2026-09-10、リタスのアイコンが Vite のロゴ（vite.dev/logo.svg）のパスを平行移動・着色した
 * 流用だったと外部（X）から指摘された。流用元は create-vite の雛形が同梱する src/assets/vite.svg。
 * アプリ素材・起動アニメ・Web・ストア掲載物に散っていたのを全面差し替えた。
 *
 * 紛れ込む経路は3つあり、どれも別の見え方をするので、3つとも見る:
 *   1. SVG のパス（テキスト）          … 座標の並びで検出
 *   2. PNG ファイル                     … 旧アイコンとのバイト一致（md5）で検出
 *   3. テキストに base64 で埋め込んだ PNG … 起動アニメ（bootLogoHtml.ts）に実際に入っていた
 *
 * ⚠ これは「既知の1件が戻ってこないこと」しか守らない。**次の未知の流用は守れない。**
 *   新しい画像やマークを入れる時は、出所をコードで持つ（生成元のスクリプトから作る）こと。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Vite の稲妻のパスに固有の座標列。普通の SVG・コードとは衝突しない。
const PATH_SIGNATURES: { name: string; re: RegExp }[] = [
  { name: 'Vite の稲妻（旧版パス）', re: /a2\.26 2\.26 0 0 0-2\.262-2\.262/ },
  { name: 'Vite の稲妻（vite.dev/logo.svg）', re: /11\.4089 13\.7892 11\.4089 13\.4682/ },
]

// 差し替え前の稲妻アイコン PNG（2026-09-10 時点の実物の md5）。
const BANNED_PNG_MD5 = new Map<string, string>([
  ['6e90ed589f178af9ea66928a35097693', '旧 icon.png / appstore-icon-1024.png'],
  ['f61a93579c5058bacb503f392aa97430', '旧 adaptive-icon.png'],
  ['26ef946b8ebcd19d0f255edf9c139c39', '旧 splash-icon.png（起動アニメにも埋め込まれていた）'],
  ['a2df0b549b2208338ee50b7636280d81', '旧 favicon.png'],
  ['ff34de495f68b4986db8eca51df8edf9', '旧 notification-icon.png'],
  ['f433652f1d73f82f24cc4754f8f83a81', '旧 play-icon-512.png'],
  ['28b36bd2a0d380032f4e4db89ce851e4', '旧 apple-touch-icon-litus.png'],
  ['ae69fc183ec4c7566a816c2a598b7446', '旧 favicon-litus-32.png'],
  ['50cd4d79df180edef9f76009b0943da0', '旧 favicon-litus-48.png'],
  ['d71aa9175bb2c700372ee530488b95bb', '旧 favicon-litus-16.png'],
])

const TEXT_EXT = /\.(svg|html?|tsx?|jsx?|json|md|css|xml|txt)$/i
const SELF = 'src/brand/noThirdPartyMarks.test.ts'
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex')

/** テキスト1本から違反を拾う（純粋関数＝陽性対照で検出器そのものを検査できる）。 */
export function findInText(text: string): string[] {
  const hits = PATH_SIGNATURES.filter((s) => s.re.test(text)).map((s) => s.name)
  for (const m of text.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)) {
    const name = BANNED_PNG_MD5.get(md5(Buffer.from(m[1], 'base64')))
    if (name) hits.push(`埋め込みPNG: ${name}`)
  }
  return hits
}

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
}

describe('🔴 第三者の商標ロゴが紛れ込んでいない', () => {
  // 陽性対照: 検出器が壊れていると、下のテストは「何も見つからない」で素通りする。
  // 綺麗な陰性ほど計器を疑う（2026-09-09 にキャッシュされた計器で実際に誤判定した）。
  it('陽性対照: 検出器は既知の違反を実際に拾える', () => {
    // 見本は連結で組み立てる。署名を1行にそのまま書くと、公開リポへの push を検査する仕組みが
    // このテストファイル自体を「ロゴの持ち込み」として止め、公開ミラーへ同期できなくなる。
    const oldVite = '<path d="M1 2a2.26 2.26 0 0 0' + '-2.262-2.262H3"/>'
    const newVite = '<path d="M12 13C11.815 13.9297 11.4089 13.7892 ' + '11.4089 13.4682V10"/>'
    expect(findInText(oldVite)).toHaveLength(1)
    expect(findInText(newVite)).toHaveLength(1)
    expect(findInText('<path d="M5.914,0 H7.526 A5.914,5.914 0 0 1 13.44,5.914 Z"/>')).toEqual([])
    expect(BANNED_PNG_MD5.size).toBeGreaterThanOrEqual(10)
  })

  it('追跡中のテキストファイルに Vite の稲妻のパスも、旧アイコンの埋め込みPNGも無い', () => {
    const files = trackedFiles().filter((f) => TEXT_EXT.test(f) && f !== SELF)
    expect(files.length, '走査対象が0件なら計器が壊れている').toBeGreaterThan(100)
    const found = files.flatMap((f) => findInText(readFileSync(f, 'utf8')).map((h) => `${f}: ${h}`))
    expect(found).toEqual([])
  })

  it('追跡中の PNG に旧アイコン（稲妻）とバイト一致するものが無い', () => {
    const pngs = trackedFiles().filter((f) => /\.png$/i.test(f))
    expect(pngs.length, '走査対象が0件なら計器が壊れている').toBeGreaterThan(0)
    const found = pngs
      .map((f) => [f, BANNED_PNG_MD5.get(md5(readFileSync(f)))] as const)
      .filter(([, name]) => name)
      .map(([f, name]) => `${f}: ${name}`)
    expect(found).toEqual([])
  })
})
