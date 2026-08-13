import { SPACE } from '../ui/scale'

/**
 * 起動画面フッター（© 2026 waiteu）の座標。**接続状況テキストの位置はここから導出する。**
 *
 * ⚠ 実機(iPhone 14 / iOS 26.6)で接続状況とフッターが重なった（2026-08-13）。原因は
 * `LoginGate` 側が `bottom: 84` という**固定値**で、コメントに「© フッター（bottom ~40px）に
 * 被らないよう」とあった＝**`env(safe-area-inset-bottom)` を数え忘れていた**。
 * フッターは `bootLogoHtml.ts` の HTML 内で
 * `bottom: calc(40px + env(safe-area-inset-bottom))` に置かれており、`viewport-fit=cover` が
 * 効いているので iPhone ではホームインジケータ分（約34pt）だけ**せり上がる**。
 * 84 は Android（inset≈0）の値としては正しく、**iOS だけが壊れる**類の間違いだった。
 *
 * ⚠ **HTML は自動生成物**（`bootLogoHtml.ts` 冒頭のコメント参照）。なのでここでは HTML を
 * 書き換えず、値を**写して**持ち、`bootFooterGeometry.test.ts` が「HTML が今もこの値か」を
 * 照合する。再生成でずれたらテストが落ちる。
 */
/** HTML の `bottom: calc(Npx + env(safe-area-inset-bottom))` の N。 */
export const BOOT_FOOTER_BOTTOM = 40

/** HTML の `font-size`。 */
export const BOOT_FOOTER_FONT = 13

/**
 * フッター1行の行ボックス高（line-height 未指定＝ブラウザ既定 normal）。
 * 正確な値は書体依存なので**多めに見積もる**。多く見積もる側の誤差は「余白が増える」だけで、
 * 重なりには絶対に転ばない。
 */
export const BOOT_FOOTER_LINE = 18

/**
 * フッターと接続状況の間に空ける余白。
 * 起動画面は情報が2行しかない静かな面なので、行間ではなく**別々のものに見える**だけの間隔を取る。
 */
export const BOOT_STATUS_GAP = SPACE.s6

/**
 * 接続状況テキストを置く `bottom`（px）。`insets.bottom` は react-native-safe-area-context の値。
 *
 * Android では WebView の `env(safe-area-inset-bottom)` が 0 でも RN 側の `insets.bottom` が
 * ジェスチャーナビ分だけ非0になりうる＝**こちらが多めに上がる**。これは安全な向きの誤差
 * （余白が増えるだけ）なので、プラットフォーム分岐は入れない。
 */
export function bootStatusBottom(insetBottom: number): number {
  const inset = insetBottom > 0 ? insetBottom : 0
  return BOOT_FOOTER_BOTTOM + inset + BOOT_FOOTER_LINE + BOOT_STATUS_GAP
}
