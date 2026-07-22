/**
 * Android 通知の small icon 設定を検証する純粋ロジック（依存ゼロ）。
 *
 * 背景: `app.json` の plugins に `expo-notifications` の設定が無いと、prebuild は
 * versionedExpoSDKPackages の自動適用で props 無しのまま走り、
 * `expo.modules.notifications.default_notification_icon` の meta-data と
 * 各 dpi の notification_icon.png を**削除する**（withNotificationsAndroid.js）。
 * その結果 ExpoNotificationBuilder は `context.applicationInfo.icon`（＝@mipmap/ic_launcher）へ
 * フォールバックする。ステータスバーの小アイコンは**アルファチャンネルだけ**を使うため、
 * ランチャーアイコン（adaptive-icon の背景が #ffffff べた塗り・元素材 assets/icon.png は
 * アルファ無しの colorType 2）を渡すと全画素が不透明扱いになり、
 * **アイコン領域が丸ごと塗り潰された四角**として描かれる。
 *
 * android/ は .gitignore された生成物なので、手で drawable を置く回避策は次の prebuild で
 * 必ず消える。配線は app.json 経由でしか成立しない。
 *
 * 必要な素材の仕様は docs/notification-icon-spec.md を参照（画像自体は別途用意する）。
 */

/** 通知用白抜きアイコンの置き場所（リポジトリルートからの相対パス）。 */
export const NOTIFICATION_ICON_PATH = 'assets/notification-icon.png'

export type PluginEntry = { name: string; props: Record<string, unknown> }

/**
 * app.json の plugins（文字列 or [名前, props] タプルが混在）から該当エントリを取り出す。
 * 見つからなければ null。props 無しの文字列エントリは空 props を返す。
 */
export function findPluginEntry(plugins: unknown[], name: string): PluginEntry | null {
  for (const p of plugins) {
    if (typeof p === 'string') {
      if (p === name) return { name, props: {} }
      continue
    }
    if (Array.isArray(p) && p[0] === name) {
      const props = typeof p[1] === 'object' && p[1] !== null ? (p[1] as Record<string, unknown>) : {}
      return { name, props }
    }
  }
  return null
}

export type PngHeader = {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * PNG の 8 バイトシグネチャと IHDR だけを読む（zlib 展開は不要）。
 * PNG でなければ null。
 */
export function parsePngHeader(bytes: Uint8Array): PngHeader | null {
  if (bytes.length < 33) return null
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null
  }
  const u32 = (o: number) =>
    ((bytes[o] << 24) >>> 0) + (bytes[o + 1] << 16) + (bytes[o + 2] << 8) + bytes[o + 3]
  return {
    width: u32(16),
    height: u32(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
    interlace: bytes[28],
  }
}

/** PNG の colorType 4（グレースケール+アルファ）/ 6（RGBA）だけがアルファを持つ。 */
export function hasAlphaChannel(colorType: number): boolean {
  return colorType === 4 || colorType === 6
}

/**
 * small icon の素材として最低限成立するか。
 * - 正方形（resizeMode:'cover' で中央クロップされるので長方形は絵柄が欠ける）
 * - 96px 以上（xxxhdpi の生成サイズ）
 * - アルファ付き（アルファが形そのもの）
 * - 非インタレース
 *
 * **これは必要条件でしかない**。「不透明部分の RGB が全て純白か」「背景が完全透明か」は
 * PNG の完全デコードが要るのでここでは見ない＝テストが緑でも実機の目視確認は省略できない。
 */
export function isValidNotificationIconHeader(h: PngHeader): boolean {
  return h.width === h.height && h.width >= 96 && hasAlphaChannel(h.colorType) && h.interlace === 0
}
