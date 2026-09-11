/**
 * ブランドマークの差し替えで「黙って壊れる」故障を止めるラチェット（2026-09-11）。
 *
 * どれも型チェック・ビルド・既存のテストを素通りし、実機でアイコンや起動画面を見て初めて分かる類の欠陥。
 * docs/brand-mark.md には手順として書いてあるが、手順は読まれない時に効かないので機械で止める。
 *   1. adaptiveIcon の背景色が白に戻る → 前景（白の記号）が白地に乗り、ランチャーのアイコンが無地に見える
 *   2. 起動アニメ（bootLogoHtml.ts）に埋め込んだ画像が assets/splash-icon.png と食い違う
 *      → 起動画面は新しいマークなのに、起動アニメだけ旧マークが残る（テキスト検索では見つからない）
 *   3. 原本 SVG（assets/brand/litus-mark.svg）が消える・壊れる → 全アセットの生成元が失われる
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex')
const appJson = JSON.parse(readFileSync('app.json', 'utf8')) as {
  expo: { android: { adaptiveIcon: { foregroundImage: string; monochromeImage?: string; backgroundColor: string } } }
}

describe('🔴 ブランドマークの差し替えで黙って壊れる所', () => {
  it('adaptiveIcon の背景色はブランド色（白ではない＝前景の白い記号が見える）', () => {
    const { backgroundColor } = appJson.expo.android.adaptiveIcon
    expect(backgroundColor.toLowerCase()).not.toMatch(/^#(fff|ffffff)$/)
    expect(backgroundColor.toLowerCase()).toBe('#0f9e75')
  })

  it('adaptiveIcon の前景とテーマアイコン用の単色層が実在する（無いと prebuild が落ちる）', () => {
    const { foregroundImage, monochromeImage } = appJson.expo.android.adaptiveIcon
    expect(existsSync(foregroundImage)).toBe(true)
    expect(monochromeImage, 'monochromeImage が未設定').toBeTruthy()
    expect(existsSync(monochromeImage!)).toBe(true)
  })

  it('起動アニメに埋め込んだ画像は assets/splash-icon.png とバイト一致する（白地版・緑地版の2か所）', () => {
    const ts = readFileSync('src/screens/bootLogoHtml.ts', 'utf8')
    const embedded = [...ts.matchAll(/<img src="data:image\/png;base64,([A-Za-z0-9+/=]+)" alt="LITUS"/g)].map((m) =>
      md5(Buffer.from(m[1], 'base64')),
    )
    expect(embedded).toHaveLength(2)
    const splash = md5(readFileSync('assets/splash-icon.png'))
    expect(embedded).toEqual([splash, splash])
  })

  it('原本 SVG は2本のパスを持つ（全アセットの唯一の生成元）', () => {
    const svg = readFileSync('assets/brand/litus-mark.svg', 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    expect(svg.match(/<path d="/g)).toHaveLength(2)
  })
})
