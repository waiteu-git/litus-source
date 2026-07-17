import { BOOT_LOGO_WHITE } from './bootLogoHtml'

/**
 * ダークテーマ用の起動ロゴHTML。**白版から色置換で派生**させる（bootLogoWarm.ts と同じ方式）。
 *
 * なぜ生成物を手で書き足さないか: bootLogoHtml.ts はフォントを base64 で埋め込んだ自動生成物で
 * 1バリアント約85KB。ダーク版を実体で持つと同じフォントをもう一部抱えることになる。
 * 白版と翠版の差分は**色9箇所だけ**で構造・アニメは完全に同一なので、置換で導出するのが正しい。
 *
 * なぜ翠版ではなく白版から派生するか: 翠版は LITUS の5文字すべてが #ffffff で、
 * **LI と TUS を色で区別できない**。白版は LI=#12332a / TUS=#0f9e75 と色が分かれているため、
 * 「LI=前景色・TUS=翠アクセント」というブランドの構造をそのままダークへ移せる。
 *
 * 地色 #0f1713 は app.json の splash.dark.backgroundColor と**完全に一致**させている。
 * ネイティブスプラッシュ→起動アニメの遷移で色が動かない＝OSダーク時のフラッシュがゼロになる。
 * ここを変えるときは app.json 側も必ず合わせること（テストで固定している）。
 */

/**
 * 白版の色 → ダーク版の色。値は theme.palette.ts の DARK / COLORS.emeraldLight と一致させる
 * （HTML文字列なのでトークンを直接参照できず、生色で持つほかない＝生色ガードの対象外の .ts）。
 */
const COLOR_MAP: Record<string, string> = {
  // 地色（body と全画面div の2箇所）→ DARK.bg。app.json の splash.dark.backgroundColor と同値。
  '#ffffff': '#0f1713',
  // 「LI」の文字（白版は濃いインク）→ DARK.heading。
  '#12332a': '#eaf3ef',
  // 「TUS」の文字とローディングバーの進捗 → ダークの翠アクセント（COLORS.emeraldLight）。
  // 白版の #0f9e75 は暗い地の上ではコントラストが落ちるため、ダーク指定色へ持ち上げる。
  '#0f9e75': '#37c99b',
  // 合体前の「CLASS」「LETUS」（消えていく装飾）→ DARK.chevron（最も沈む前景）。
  '#a7bcb3': '#5f6f68',
  // 「リタス」→ DARK.label。
  '#8a968f': '#93a69e',
  // ローディングバーの軌道 → DARK.divider。
  '#e3ebe7': 'rgba(255,255,255,0.10)',
  // © 表記 → DARK.chevron。
  '#b4bfba': '#5f6f68',
}

/**
 * bolt画像（単色 #0f9e75 のPNG）をダークの翠アクセント相当まで持ち上げる。
 * 白版は bolt と「TUS」が同じ #0f9e75 で揃っている。TUS を #37c99b にする以上、
 * boltも合わせないと同じ画面に2種類の緑が並ぶ。PNGは置換できないのでフィルタで明度を上げる
 * （#0f9e75 × 1.3 ≒ #13ce98 ＝ #37c99b とほぼ同じ明るさ）。
 */
const BOLT_FILTER_FROM = 'filter:none'
const BOLT_FILTER_TO = 'filter:brightness(1.3)'

/**
 * 白版HTMLの色をダーク版へ一括置換する。**1パスで走査する**（順に replace を重ねると
 * 置換後の色が次の規則に再マッチしうる）。未知の色は素通し＝生成物が将来変わっても壊れない。
 */
export function toDarkBootHtml(html: string): string {
  const keys = Object.keys(COLOR_MAP)
  // 正規表現の特殊文字は色コードに含まれないが、念のためエスケープする。
  const pattern = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
  return html.replace(pattern, (m) => COLOR_MAP[m] ?? m).split(BOLT_FILTER_FROM).join(BOLT_FILTER_TO)
}

// 起動時のコストを避けるためモジュール読込時に一度だけ変換してキャッシュ（warm版と同じ方針）。
export const BOOT_LOGO_DARK = toDarkBootHtml(BOOT_LOGO_WHITE)
