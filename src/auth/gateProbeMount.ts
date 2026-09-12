/**
 * 起動ゲートの probe（ログイン判定用の非表示 WebView。CLASS の ShibbolethAuthServlet を開く）を
 * マウントしてよいか（純粋・テスト可能)。設計: docs/design/2026-09-12-v11-train1-PC.md
 *
 * false の2状態は「規約の同意がまだ確定していない」。ここで WebView を作ると、同意の前に CLASS と
 * 大学のログイン基盤（Microsoft）へ通信し、再同意の利用者ではログイン済みの CLASS まで読み込む
 * ＝ストア掲載文「利用規約に同意いただくまで、LETUSとCLASSからの情報の取得は始まりません」に反する。
 *
 * Record にしてあるのは、GateStateName に状態を足した人がここで必ず決めるため（書き忘れは型エラー）。
 * 「loading と needsConsent 以外」を否定形で書くと、足した状態が黙って「作る」側に入る。
 */
import type { GateStateName } from './gateRecovery'

const PROBE_MOUNT: Record<GateStateName, boolean> = {
  loading: false, // 同意済みの版をまだ読めていない
  needsConsent: false, // 規約画面（新規・再同意とも）
  firstRun: true, // 同意の後。スライドの裏で probe を走らせる（既存どおり・オーナー裁定）
  checking: true, // probe の判定を待つ唯一の状態。作らないと12秒で必ず接続エラー
  needsLogin: true, // probe の WebView そのものをログイン画面として見せる
  setup: true, // probe の WebView から時間割を取り込む
  sync: true,
  authed: true,
  maintenance: true, // 再 probe（nonce+1 → checking）
  connError: true, // 再 probe（nonce+1）
}

export function shouldMountGateProbe(state: GateStateName): boolean {
  return PROBE_MOUNT[state]
}
