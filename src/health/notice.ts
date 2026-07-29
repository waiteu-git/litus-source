/**
 * お知らせ帯の表示判定（純粋・RN非依存）。
 *
 * 公開直後に最も起こりやすいのは「何かが壊れて、説明できない」こと。リタスには
 * 全ユーザーへ何かを伝える手段が1本も無く（サーバープッシュ無し・X/Discordは
 * 到達保証なし）、障害時に残るのは「壊れたアプリ」だけになる。既に本番で生きている
 * status.json の message を、停止していないときは「お知らせ帯」として出すことで
 * その1本を作る。**新しい取得経路は増やさない**（増やすとそれ自体が新しい無言の
 * 失敗ポイントになる）。
 *
 * 描画は KillSwitchProvider（LoginGate の外側）が行う。ログインできない層こそ
 * 一番届けたい相手なので、ホーム内には置かない。
 * 設計: docs/2026-07-12-remote-kill-switch-design.md（kill switch本体）
 */
import { isAppKilled, type KillSwitchStatus } from './killSwitch'

/**
 * 停止画面とお知らせ帯からの脱出先。**status.json から配らずコードに固定する。**
 * 脱出経路が、壊れているかもしれない同じ配信路に依存してはいけない
 * （status.json が壊れて取得失敗になっても、固定URLなら必ず開ける）。
 * 内容の差し替えは Web 側（Cloudflare Pages＝数秒で反映）で行う、という層分け。
 */
export const LITUS_SITE_URL = 'https://litus.waiteu.dev/'

export type Notice = {
  /** 表示する本文（前後の空白を落としたもの）。 */
  text: string
  /** 既読記録用のキー。文面が変われば変わる＝新しいお知らせは既読でも再表示される。 */
  hash: string
}

/**
 * 文面から既読キーを作る（FNV-1a 32bit の16進8桁）。
 *
 * status.json には通知IDが無く、スキーマは増やさない方針なので「文面そのもの」を
 * 同一性の基準にする。副次的に、**文面を変えれば自動で再表示される**ので
 * 「新しいお知らせを出したのに既読扱いで消える」事故が構造的に起きない。
 * 暗号用途ではない（衝突しても「一度消したお知らせが再表示されない」だけ）。
 */
export function noticeHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * いま出すべきお知らせを決める。出さないときは null。
 *
 * - デモ中は出さない。**階層（DemoProvider が外側）では防げない**: KillSwitchProvider は
 *   起動時に実名前空間のキャッシュを読み込み済みで、あとからデモへ入っても status を
 *   持ったままになるため、ここで明示的に止める（審査員のデモ体験に運用メッセージを混ぜない）。
 * - アプリ全停止中は出さない（停止画面が同じ message を出すので二重になる）。
 * - 空文字・空白のみは「お知らせ無し」。parseKillSwitchStatus の normText は '' しか
 *   弾かない（trimしない）ので、空白潰しはここの責務。
 * - 既読ハッシュと一致すれば出さない。
 *
 * 機能別停止（disabled:['attendance'] 等）のときも**出す**。その画面に到達できない人にも
 * 届けるのがこの帯の目的なので、上位での表示を優先する。
 *
 * ⚠運用の約束（重複表示はここで避ける）: KillSwitchBanner は機能停止中の画面内に
 * `status.message` を**そのまま**出す（src/ui/KillSwitchBanner.tsx）。つまり
 * 「機能別停止 ＋ message あり」では同じ文が帯と画面内の2箇所に出る。避け方はコードではなく
 * status.json の書き方:
 *   - 機能別停止だけを伝えたい → **message は空にする**。画面内バナーが既定文言
 *     「この機能は現在一時停止中のためご利用いただけません。」で説明する。
 *   - 全員に伝えたいことがある → message を入れる。重複してでも上位に出す方を選ぶ
 *     （その画面に行けない人に届かない方が損失が大きい）。
 * コード側で片方を抑制しないのは、抑制の判定が結局「同じ文字列か」に帰着し、
 * 上の2条件では常に同一文になる＝分岐の片側が死ぬため。運用で決める方が素直。
 */
export function resolveNotice(
  status: KillSwitchStatus | null,
  opts: { demo: boolean; dismissedHash: string | null },
): Notice | null {
  if (opts.demo) return null
  if (isAppKilled(status)) return null
  const text = (status?.message ?? '').trim()
  if (text === '') return null
  const hash = noticeHash(text)
  if (hash === opts.dismissedHash) return null
  return { text, hash }
}
