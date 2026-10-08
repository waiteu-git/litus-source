/**
 * 起動画面（アプリ内の WebView）の「お祝いの飾り」＝ロゴを囲む月桂樹の輪。
 * 設計: docs/design/2026-10-08-celebration-mode.md（本人承認 2026-10-08）。
 *
 * 出所（ブランド資産の規約・docs/brand-mark.md）: **この図形はこのファイルの数値だけで決まる自前の幾何**。
 * 外部の画像・ロゴ・メダル・校章・写真・生成AIの出力は一切使っていない。葉＝楕円（rx=LEAF_RX, ry=LEAF_RY）を
 * 円周（中心 (100,100)・半径 RING_R）に沿って並べ、左右対称に置く。頂点に小さな点を1つ。
 *   - 葉は左右8枚ずつ。ロゴ側（真下）の角度 FIRST_DEG から STEP_DEG ずつ上へ（上端は開けておく＝輪は閉じない）。
 *   - viewBox は 200x200、表示は 204px（ロゴ 144px の入れ物の中心に置く。ロゴ半径 72px の外側に葉が回る）。
 * 「メダルや賞の絵」ではなく葉の輪だけ（祝いの定番の形）。形が似るものが無いかは実物で目視する（採用記録）。
 *
 * 作法（bootLogoDark / bootLogoWarm と同じ）: 原本 bootLogoHtml.ts は生成物で手編集しない。
 * 各 HTML を**文字列変換で派生**し、足すだけで既存を1文字も変えない（bootLogoCelebrate.test.ts が復元で確認）。
 *
 * 配置: ロゴの入れ物（144x144・boltRise で上昇する要素）の**子**にする。ロゴと一緒に動くので位置がずれず、
 * ロゴ列の流れ（縦中央寄せ・boltRise の 121.2px は列の高さの実測値）を変えない。
 * **中心をロゴの中心より 20px 上へずらす**（RING_UP）: full のイントロでは、ロゴの下 15.9px まで「CLASS」が
 * 寄ってくる（bootLogoHtml.ts のコメント）。輪を中心に置くと下端の葉がその間隔を食って文字に重なる
 * （独立レビューがヘッドレス Chrome で実測・約9px）。14px では下端と文字のすき間が約2pxしか残らなかったので 20px にした（実測で約8px）。
 * 現れ方: boltRise（0.15s + 0.9s）がほぼ落ち着く 0.75s から、**0.36s**（規約の祝福の上限 360ms）で淡く出す。静止後は動かない。
 * 視覚効果を減らす設定では、**動き（拡大）を外して透明度だけ**のフェードにする。最初から不透明にすると、
 * ロゴが OS のスプラッシュ位置（拡大・下寄り）にいる間に、ロゴより大きい輪が突然出る（レビューで実測）。
 * ⚠warm 変換（animation を最終状態へ畳む）は先に済んだ HTML に足す。ここの animation は畳まれない。
 */

export type CelebrateVariant = 'white' | 'green' | 'dark'

const RING_R = 84
const LEAF_RX = 17
const LEAF_RY = 7
const LEAVES_PER_SIDE = 8
const FIRST_DEG = 10
const STEP_DEG = 17
/** 葉の長軸を、円周の接線から外向きに傾ける角度。隣の葉と重なり、点線ではなく葉の連なりに見える。 */
const TILT_DEG = 24
/** 輪の中心をロゴの中心から上へずらす量（px）。 */
const RING_UP = 20

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

function wreathSvg(variant: CelebrateVariant): string {
  const { leaves, dot } = PALETTE[variant]
  const parts: string[] = []
  for (let k = 0; k < LEAVES_PER_SIDE; k++) {
    const deg = FIRST_DEG + k * STEP_DEG
    const phi = (deg * Math.PI) / 180
    const x = 100 - RING_R * Math.sin(phi)
    const y = 100 + RING_R * Math.cos(phi)
    const fill = leaves[k % 2]
    // 左: 円周の接線方向に葉の長軸を向ける（rotate = deg）。右はその鏡像。
    parts.push(
      `<ellipse cx="${round1(x)}" cy="${round1(y)}" rx="${LEAF_RX}" ry="${LEAF_RY}" fill="${fill}" transform="rotate(${deg + TILT_DEG} ${round1(x)} ${round1(y)})"/>`,
    )
    parts.push(
      `<ellipse cx="${round1(200 - x)}" cy="${round1(y)}" rx="${LEAF_RX}" ry="${LEAF_RY}" fill="${fill}" transform="rotate(${-(deg + TILT_DEG)} ${round1(200 - x)} ${round1(y)})"/>`,
    )
  }
  parts.push(`<circle cx="100" cy="${100 - RING_R}" r="5" fill="${dot}"/>`)
  return (
    '<svg class="celeb" viewBox="0 0 200 200" aria-hidden="true" ' +
    'style="position:absolute;left:50%;top:50%;width:204px;height:204px;margin:-' + (102 + RING_UP) + 'px 0 0 -102px;pointer-events:none;' +
    'animation:celebIn 0.36s cubic-bezier(0.16,1,0.3,1) 0.75s both;">' +
    parts.join('') +
    '</svg>'
  )
}

const CELEB_CSS =
  '/*celeb-start*/' +
  '@keyframes celebIn{0%{opacity:0;transform:scale(0.94)}100%{opacity:1;transform:scale(1)}}' +
  '@keyframes celebFade{0%{opacity:0}100%{opacity:1}}' +
  '@media (prefers-reduced-motion: reduce){.celeb{animation:celebFade 0.36s cubic-bezier(0.16,1,0.3,1) 0.75s both!important}}' +
  '/*celeb-end*/'

const LOGO_BOX_OPEN = '<div style="width:144px;height:144px;animation:boltRise'
const LOGO_IMG = '"><img src="data:image/png'

/**
 * 起動画面の HTML（原本・ダーク・warm のいずれも）にお祝いの輪を足す。
 * 足す場所（ロゴの入れ物）が見つからない・すでに足してある場合は、そのまま返す（起動を壊さない）。
 */
export function toCelebrateBootHtml(html: string, variant: CelebrateVariant): string {
  if (html.includes('<svg class="celeb"')) return html
  const i = html.indexOf(LOGO_BOX_OPEN)
  if (i < 0) return html
  const j = html.indexOf(LOGO_IMG, i)
  // ロゴの入れ物の開きタグと画像が直結していること（間に別の要素が挟まる HTML には足さない）。
  if (j < 0 || j - i > 160) return html
  const styleRest = html.slice(i + LOGO_BOX_OPEN.length, j)
  const withBox =
    html.slice(0, i) + '<div style="position:relative;width:144px;height:144px;animation:boltRise' + styleRest + '">'
  const afterTag = html.slice(j + 2) // 先頭が '<img src="data:image/png...'
  const out = withBox + wreathSvg(variant) + afterTag
  const k = out.indexOf('</style>')
  if (k < 0) return html
  return out.slice(0, k) + CELEB_CSS + out.slice(k)
}
