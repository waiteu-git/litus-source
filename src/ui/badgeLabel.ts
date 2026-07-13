/** 件数バッジのラベル合成。count未指定ならラベルのみ、指定あれば「ラベル N」。純粋＝RN非依存。
 * 注意: count===0は「ラベル 0」を表示する（null/undefinedのみラベルのみ）。呼び出し側はcount===0のとき
 * 表示可否を自分でガードすること（現行サイトは>0のときのみ描画）。 */
export function badgeCountLabel(label: string, count?: number): string {
  return count == null ? label : `${label} ${count}`
}
