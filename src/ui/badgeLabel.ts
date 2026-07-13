/** 件数バッジのラベル合成。count未指定ならラベルのみ、指定あれば「ラベル N」。純粋＝RN非依存。 */
export function badgeCountLabel(label: string, count?: number): string {
  return count == null ? label : `${label} ${count}`
}
