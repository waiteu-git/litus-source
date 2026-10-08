/**
 * 起動画面（アプリ内の WebView）の「お祝いの飾り」＝ロゴの**上**に置く、お祝いの2行と葉の飾り。
 * 設計: docs/design/2026-10-08-celebration-mode.md（本人承認 2026-10-08・配置は 2026-10-08 に「ロゴの上・ロゴと被せない」へ変更）。
 *
 * 出所（ブランド資産の規約・docs/brand-mark.md）: **葉の飾りはこのファイルの数値だけで決まる自前の幾何**。
 * 外部の画像・ロゴ・メダル・校章・写真・生成AIの出力は一切使っていない。葉＝楕円（rx=LEAF_RX, ry=LEAF_RY）を
 * 浅い弧（半径 ARC_R）に沿って左右対称に並べ、頂点に小さな点を1つ置く。**お祝いの2行を、この弧（∩）と、それを上下反転した弧（∪）で
 * 上下から挟む**（本人の指示 2026-10-08「お祝いメッセージを上下から挟む感じに」）。
 *   - 葉は左右 LEAVES_PER_SIDE 枚ずつ。頂点側（点の隣）から ARC_FIRST_DEG・ARC_STEP_DEG ずつ離れる。
 *   - 葉の長軸は円弧の接線から TILT_DEG だけ外へ開く（点線でなく葉の連なりに見える）。
 *   - viewBox は SVG_W x SVG_H、表示も同じ px。
 * 「メダルや賞の絵」ではなく葉だけ（祝いの定番の形）。形が似るものが無いかは実物で目視する（採用記録）。
 *
 * 作法（bootLogoDark / bootLogoWarm と同じ）: 原本 bootLogoHtml.ts は生成物で手編集しない。
 * 各 HTML を**文字列変換で派生**し、足すだけで既存を1文字も変えない（bootLogoCelebrate.test.ts が復元で確認）。
 *
 * 配置: ロゴの入れ物（144x144・boltRise で上昇する要素）の**子**で、**入れ物の真上**（bottom:100%＋余白）。
 * 上から 葉の弧（∩）→ 2行 → 葉の弧（∪）の順に積み、全体の高さは約 96px（360x640 の小さい端末でもロゴの上端まで
 * 状態バーの下に収まる＝ロゴの上端は画面の上から (画面の高さ−379)/2。実測は design doc）。
 * ロゴと一緒に動くので位置がずれず、ロゴ列の流れ（縦中央寄せ・boltRise の 121.2px は列の高さの実測値）を変えない。
 * ロゴの上は、フルイントロでも何も来ない空き（CLASS・LETUS はロゴの下に集まる）なので、飾りがロゴや文字に重ならない。
 * 本人の指示（2026-10-08）: 「飾りはアイコンの上。ロゴと被せたくない」。ロゴを**囲まない**。
 * 日本語は埋め込みフォントが漢字を持たないので端末の和文フォントになる（lang="ja"＝Android で中国語字形に倒れない）。
 * 現れ方: boltRise（0.15s + 0.9s）がほぼ落ち着く 0.75s から、**0.36s**（規約の祝福の上限 360ms）で淡く出す。静止後は動かない。
 * 視覚効果を減らす設定では、**動き（拡大）を外して透明度だけ**のフェードにする。
 * ⚠warm 変換（animation を最終状態へ畳む）は先に済んだ HTML に足す。ここの animation は畳まれない。
 */
import { CELEBRATION_COPY } from '../celebration/celebration'
import { celebrationColors } from '../theme.celebration'

export type CelebrateVariant = 'white' | 'green' | 'dark'

const LEAF_RX = 11
const LEAF_RY = 4.4
const LEAVES_PER_SIDE = 6
const ARC_R = 420
const ARC_FIRST_DEG = 2.2
const ARC_STEP_DEG = 2.2
/** 葉の長軸を、円弧の接線から外向きに傾ける角度。隣の葉と重なり、点線ではなく葉の連なりに見える。 */
const TILT_DEG = 22
const SVG_W = 220
const SVG_H = 25
/** 葉の中心の上端（頂点の葉）の余白。 */
const PAD_TOP = 7
/** 文言と葉の弧との間（px）。 */
const GAP_TEXT_TO_ORNAMENT = 1
/** 下の葉の弧の下端とロゴの入れ物の上端との間（px）。 */
const GAP_TO_LOGO = 10

const PALETTE: Record<CelebrateVariant, { leaves: [string, string]; dot: string }> = {
  // 白地: 翠の濃淡（象牙は白に溶けるので葉には使わない）
  white: { leaves: ['#0f9e75', '#0b7d5c'], dot: '#7a6a35' },
  // 翠地: 翠は同化するので象牙の濃淡
  green: { leaves: ['#f3ecd2', '#e2d6a8'], dot: '#ffffff' },
  // 暗地: 明るめの翠
  dark: { leaves: ['#34c79a', '#1f9a76'], dot: '#f3ecd2' },
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

/** 葉の弧。up＝∩（頂点が上・文言の上に置く）／down＝∪（上下反転・文言の下に置く）。 */
function ornamentSvg(variant: CelebrateVariant, dir: 'up' | 'down'): string {
  const { leaves, dot } = PALETTE[variant]
  const cy = PAD_TOP + ARC_R // 円弧の中心（頂点の葉の真下）
  const parts: string[] = []
  for (let k = 0; k < LEAVES_PER_SIDE; k++) {
    const deg = ARC_FIRST_DEG + k * ARC_STEP_DEG
    const phi = (deg * Math.PI) / 180
    const x = SVG_W / 2 - ARC_R * Math.sin(phi)
    const y = cy - ARC_R * Math.cos(phi)
    const fill = leaves[k % 2]
    // 左: 円弧の接線（頂点から離れる向き＝左下がり）に長軸を合わせ、外（上）へ TILT だけ開く。右はその鏡像。
    parts.push(
      `<ellipse cx="${round1(x)}" cy="${round1(y)}" rx="${LEAF_RX}" ry="${LEAF_RY}" fill="${fill}" transform="rotate(${round1(-deg + TILT_DEG)} ${round1(x)} ${round1(y)})"/>`,
    )
    parts.push(
      `<ellipse cx="${round1(SVG_W - x)}" cy="${round1(y)}" rx="${LEAF_RX}" ry="${LEAF_RY}" fill="${fill}" transform="rotate(${round1(deg - TILT_DEG)} ${round1(SVG_W - x)} ${round1(y)})"/>`,
    )
  }
  parts.push(`<circle cx="${SVG_W / 2}" cy="${PAD_TOP - 4}" r="3" fill="${dot}"/>`)
  // ∪ は ∩ を上下に反転するだけ（葉の回転も、点の位置も一緒に鏡映される）。
  const body = parts.join('')
  const inner = dir === 'down' ? `<g transform="translate(0 ${SVG_H}) scale(1 -1)">${body}</g>` : body
  const margin = dir === 'up' ? `margin-bottom:${GAP_TEXT_TO_ORNAMENT}px;` : `margin-top:${GAP_TEXT_TO_ORNAMENT}px;`
  return (
    `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" aria-hidden="true" ` +
    `style="display:block;width:${SVG_W}px;height:${SVG_H}px;${margin}">` +
    inner +
    '</svg>'
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const BLOCK_WIDTH = 320
/** ロゴの入れ物（144px）の中心に、幅 BLOCK_WIDTH のブロックを中央寄せするための左オフセット。 */
const BLOCK_LEFT = (144 - BLOCK_WIDTH) / 2

function celebrateBlock(variant: CelebrateVariant): string {
  const c = celebrationColors(variant)
  return (
    '<div class="celeb" lang="ja" ' +
    `style="position:absolute;left:${BLOCK_LEFT}px;bottom:100%;width:${BLOCK_WIDTH}px;margin-bottom:${GAP_TO_LOGO}px;` +
    'display:flex;flex-direction:column;align-items:center;text-align:center;white-space:nowrap;pointer-events:none;' +
    'animation:celebIn 0.36s cubic-bezier(0.16,1,0.3,1) 0.75s both;">' +
    ornamentSvg(variant, 'up') +
    `<span style="font-family:system-ui,sans-serif;font-size:14px;font-weight:700;line-height:1.4;letter-spacing:0.04em;color:${c.bootTitle};">${escapeHtml(CELEBRATION_COPY.bootTitle)}</span>` +
    `<span style="font-family:system-ui,sans-serif;font-size:12px;font-weight:500;line-height:1.4;letter-spacing:0.06em;color:${c.bootName};">${escapeHtml(CELEBRATION_COPY.bootName)}</span>` +
    ornamentSvg(variant, 'down') +
    '</div>'
  )
}

const CELEB_CSS =
  '/*celeb-start*/' +
  '@keyframes celebIn{0%{opacity:0;transform:translateY(4px)}100%{opacity:1;transform:translateY(0)}}' +
  '@keyframes celebFade{0%{opacity:0}100%{opacity:1}}' +
  '@media (prefers-reduced-motion: reduce){.celeb{animation:celebFade 0.36s cubic-bezier(0.16,1,0.3,1) 0.75s both!important}}' +
  '/*celeb-end*/'

const LOGO_BOX_OPEN = '<div style="width:144px;height:144px;animation:boltRise'
const LOGO_IMG = '"><img src="data:image/png'

/**
 * 起動画面の HTML（原本・ダーク・warm のいずれも）にお祝いの飾りを足す。
 * 足す場所（ロゴの入れ物）が見つからない・すでに足してある場合は、そのまま返す（起動を壊さない）。
 */
export function toCelebrateBootHtml(html: string, variant: CelebrateVariant): string {
  if (html.includes('<div class="celeb"')) return html
  const i = html.indexOf(LOGO_BOX_OPEN)
  if (i < 0) return html
  const j = html.indexOf(LOGO_IMG, i)
  // ロゴの入れ物の開きタグと画像が直結していること（間に別の要素が挟まる HTML には足さない）。
  if (j < 0 || j - i > 160) return html
  const styleRest = html.slice(i + LOGO_BOX_OPEN.length, j)
  const withBox =
    html.slice(0, i) + '<div style="position:relative;width:144px;height:144px;animation:boltRise' + styleRest + '">'
  const afterTag = html.slice(j + 2) // 先頭が '<img src="data:image/png...'
  const out = withBox + celebrateBlock(variant) + afterTag
  const k = out.indexOf('</style>')
  if (k < 0) return html
  return out.slice(0, k) + CELEB_CSS + out.slice(k)
}
