/**
 * お祝いデザインの色（翠のまま、白〜象牙を添えるだけ）。画面は生の色を書かず、ここ（.ts）を経由する
 * （CLAUDE.md の「トークンを迂回した生hex/生rgbaを画面に書かない」＝rawColorGuard は .tsx だけを走査する）。
 *
 * 方針（本人承認 2026-10-08）
 * - **金は使わない。** 警告色（warn・琥珀系）や favorite/flag の色と同族になり、「色が付いている＝異常」の
 *   規約と読み違えるため。象牙（#f3ecd2 系）は色相が黄緑寄りで、琥珀系の値とは別（テストで同値を禁止）。
 * - 読む面（カード内の文字）は 4.5:1 以上、見出し下の線は地の上で見える濃さ（theme.celebration.test.ts）。
 * - 新しい意味色ではなく「飾り」＝danger/warn/info/success には触れない。
 */

export type CelebrationVariant = 'green' | 'white' | 'dark'

export type CelebrationColors = {
  /** ホームのカードの縁（象牙）。**地と文字は標準のガラスカード（useUi の card・valueColor・labelColor）に任せる**
   *  ＝淡い黄みの面にしない（警告面 warnBg と見分けがつかず「色が付いている＝異常」と読み違えるため・独立レビュー指摘）。 */
  cardBorder: string
  /** カードの絵（フラスコと星）。外形・液・星の塗りと縁。 */
  markOutline: string
  markLiquid: string
  markStarFill: string
  markStarStroke: string
  /** 画面の見出しの下の細い線。 */
  headerLine: string
  /** 起動画面の2行（ロゴの真上）。 */
  bootTitle: string
  bootName: string
}

const GREEN: CelebrationColors = {
  cardBorder: '#e6dcb8',
  markOutline: '#0b3d2e',
  markLiquid: '#0a6a4e',
  markStarFill: '#ecdca0',
  markStarStroke: '#5f5226',
  headerLine: '#f3ecd2',
  // 翠の起動画面は、文字のある高さ（ロゴの真上・画面の上から約6〜30%）が明るめの翠＝白文字は読めない。さらに深い翠を使う。
  bootTitle: '#021f19',
  bootName: '#021f19',
}

const WHITE: CelebrationColors = {
  cardBorder: '#e6dcb8',
  markOutline: '#0b3d2e',
  markLiquid: '#0a6a4e',
  markStarFill: '#ecdca0',
  markStarStroke: '#5f5226',
  // 白地で象牙は消えるので、一段濃い象牙〜土色寄りの線にする。
  headerLine: '#cdbf8e',
  bootTitle: '#4a5f57',
  bootName: '#55695f',
}

const DARK_: CelebrationColors = {
  cardBorder: '#4a4630',
  markOutline: '#d8c98f',
  markLiquid: '#34c79a',
  markStarFill: '#d8c98f',
  markStarStroke: '#f3ecd2',
  headerLine: '#b9ae85',
  bootTitle: '#cfe3da',
  bootName: '#a9bfb5',
}

export function celebrationColors(variant: CelebrationVariant): CelebrationColors {
  if (variant === 'dark') return DARK_
  return variant === 'white' ? WHITE : GREEN
}
