import { Easing } from 'react-native'

export { SPRING_SPATIAL, pxPerMsToPxPerSec } from './spring'

/**
 * アプリ共通のモーショントークン（litus モーション試作 ①〜④ で確定）。
 * 画面内アニメは原則ここの duration / easing / displacement を使い、統一感を最優先にする。
 * すべて transform（translate / scale）と opacity で表現し、`useNativeDriver: true` に載せる
 * （高さアニメだけはネイティブ非対応のためアコーディオンで別途 LayoutAnimation を使う）。
 */

/** 継続時間（ms）。micro=マイクロ操作 / fast=フェード / base=標準 / slow=大きめの移動。
 *  ambient=長尺の環境ループ（生値で散っていた NowPulse1600 / IndeterminateBar1100 / ホームエッジ線420 を収容）。 */
export const DUR = {
  micro: 120,
  fast: 180,
  base: 240,
  slow: 360,
  ambient: { pulse: 1600, bar: 1100, edge: 420 },
} as const

/** イージング。enter=入って止まる / exit=出ていく / move=画面内移動。CSS の cubic-bezier と一致。 */
export const EASE = {
  enter: Easing.bezier(0.215, 0.61, 0.355, 1), // out-cubic
  exit: Easing.bezier(0.55, 0.055, 0.675, 0.19), // in-cubic
  move: Easing.bezier(0.645, 0.045, 0.355, 1), // inout-cubic
} as const

/** 変位量（px）。small/medium/large の3段で揃える。 */
export const SHIFT = { small: 8, medium: 16, large: 24 } as const

/** ヒーローの控えめなバネ。overshoot は scale 1.03 まで（過剰バウンス禁止）。 */
export const SPRING = { from: 0.9, over: 1.03, to: 1, upMs: 240, downMs: 150 } as const

/**
 * 画面×モーション割当表（正典）。「ユーザーが起こした動き=spring / システムが告げる変化=DUR+EASE」。
 * ── タブ切替(3タブ): 無 or 120msクロスフェード（高頻度動線＝動かさない）
 * ── カード出現(ホーム初期): fade+translateY SHIFT.small(8) / DUR.fast(180) / EASE.enter / stagger40ms / 上限3枚
 * ── リスト(課題一覧=仮想化): スクロール入場アニメ禁止。増減は Accordion系(非仮想化)のみ LayoutAnimation
 * ── スワイプ(掲示カルーセル/曜日): SPRING_SPATIAL.base + フリック速度引き継ぎ(pxPerMsToPxPerSec)。現行timing crossfadeを指追従springへ新設
 * ── 押下: scale(0.97)+opacity0.92 / DUR.micro(120)。共通 PressableCard/Row で全Pressableへ(P2)
 * ── 完了: 課題チェック=軽haptic+180msチェック描画 / リアペ提出確定・出席確定のみSuccess haptic+360ms上限の祝福1回 / 既読=無音
 * ── pull-to-refresh: ネイティブRefreshControl。iOS=tintColor / Android=colors+progressBackgroundColor
 * ── Reduce Motion: SHIFT/stagger/springバウンス無効化＋ambientループ停止(reducedMotion.ts)
 */
