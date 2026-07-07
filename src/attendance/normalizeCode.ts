/** 認証コードを半角ASCII数字へ正規化する（実機で全角だと弾かれるため送信直前に適用）。 */
export function normalizeAttendanceCode(input: string): string {
  return input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, '')
}
