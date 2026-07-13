/**
 * ソース中の生hex/生rgba（トークンを迂回した色）を検出する純マッチャ。React Native 非依存。
 * 行末に `// design-allow` があればその行は許容（トークン定義や注釈スウォッチ用）。
 * spacing/motion と違い色は種類が多いので、まず色から機械強制する。
 */
const HEX = /#[0-9a-fA-F]{3,8}\b/g
const RGBA = /rgba?\([^)]*\)/g

export function findRawColors(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (line.includes('// design-allow')) continue
    out.push(...(line.match(HEX) ?? []))
    out.push(...(line.match(RGBA) ?? []))
  }
  return out
}
