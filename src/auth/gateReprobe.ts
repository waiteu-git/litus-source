/**
 * 起動ゲート（LoginGate）の自動 probe を「いつ撃つか」だけを決める層（純粋・RN非依存）。
 *
 * 設計: docs/design/2026-09-12-v11-train1-G1.md
 *
 * probe＝ログイン確認用の非表示 WebView を作り直して CLASS を開き直すこと。1回ごとに
 * ShibbolethAuthServlet から SSO を歩き直すので、接続エラー画面を前面で開いたままの端末が
 * 15秒固定で無期限に撃ち続けると、大学側の障害時に最も強く叩く経路になる。
 * ここでは間隔を 15秒から倍々で上限5分へ伸ばし（±20%のジッタ）、メンテの帯の中は明けに1回だけにする。
 * setInterval は使わない（1回撃つたびに次の待ちを決める setTimeout の連鎖）。
 * 出席の conflictBackoff.ts とは共通化しない（出席エンジンが import しており、v1.1 では出席の経路に触らない）。
 */
import { maintenanceEndAt } from '../health/maintenanceWindow'

/** 間隔の下限。変更前の LoginGate の CONN_ERROR_REPROBE_MS（15秒固定）と同じ値。 */
export const CONN_REPROBE_BASE_MS = 15_000
/** 間隔の上限（設計 §9-1 でオーナー承認＝5分）。 */
export const CONN_REPROBE_MAX_MS = 300_000
/** メンテの帯の外（臨時メンテ・明けの遅れ）の再確認間隔。変更前の LoginGate から移した（値は不変）。 */
export const MAINTENANCE_REPROBE_MS = 60_000
/** メンテの明け時刻からのぶれ幅（全端末が 4:00:00 に揃って叩かないように散らす）。 */
export const MAINTENANCE_END_SPREAD_MS = 60_000

/**
 * delay(a): attempt 回目（0始まり）の待ち。clamp(min(BASE*2^a, MAX) * (0.8+0.4*rand), BASE, MAX)。
 * a が負・非数なら0とみなす。rand が非数なら 0.5（ジッタ無し）とみなす。
 * rand は [0, 1) を呼び出し側から注入する（テストを決定的にするため内部で Math.random() を呼ばない）。
 */
export function connErrorReprobeDelayMs(attempt: number, rand: number): number {
  const a = Number.isNaN(attempt) || attempt < 0 ? 0 : attempt
  const r = Number.isNaN(rand) ? 0.5 : rand
  const raw = Math.min(CONN_REPROBE_BASE_MS * 2 ** a, CONN_REPROBE_MAX_MS)
  const jittered = Math.round(raw * (0.8 + 0.4 * r))
  return Math.min(CONN_REPROBE_MAX_MS, Math.max(CONN_REPROBE_BASE_MS, jittered))
}

export type ReprobeEvent = 'wait' | 'probe' | 'stop'

export type ConnErrorReprobe = {
  /**
   * 'enter': 直近から delay(0), delay(1), … の順に撃つ連鎖を張る。
   * 'resume': 張り直す。min(BASE, max(0, 直近 + BASE - 今)) 後に1回撃ち、それを直近として delay(0) から続ける
   * （外側の min は端末の時計が戻った時だけ効く。通常の時計では設計 §4.2 の max(0, 直近 + BASE - 今) と同じ値）。
   * どちらも同期では撃たない（待ちが0でも setTimeout を通す）。
   */
  start(mode: 'enter' | 'resume'): void
  /** 待ちを消す（直近の時刻は保持する）。待ちが無ければ何もしない。 */
  stop(): void
  /** 待ちが張られているか。 */
  isRunning(): boolean
}

/**
 * connError 中の予定表（RN非依存・setTimeout と Date.now だけ使う）。
 *
 * 🔴 不変条件＝この予定表が撃つ probe 同士は、start／stop をどう混ぜても CONN_REPROBE_BASE_MS（15秒）以上
 * 空く（変更前の固定間隔より頻繁にならない）。直近の probe 時刻（作った時刻で初期化＝connError に入る
 * 原因になった失敗の時刻）・回数・タイマーはこの中だけに持つ。LoginGate の ref で持ち回ると、床が
 * テストの外の配線に乗る（設計の禁止事項6）。
 *
 * 待ちは「直近 + 間隔 - 今」を 0〜間隔 に収める。上側の clamp は端末の時計が戻った時だけ効く
 * （設計 §4.1「間隔は必ず15秒〜5分に収める」を時計の巻き戻しでも破らないため）。
 */
export function createConnErrorReprobe(
  onProbe: () => void,
  opts?: { random?: () => number; onEvent?: (event: ReprobeEvent, ms: number) => void },
): ConnErrorReprobe {
  const random = opts?.random ?? Math.random
  const onEvent = opts?.onEvent
  let lastProbeAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null

  function clear(): boolean {
    if (timer == null) return false
    clearTimeout(timer)
    timer = null
    return true
  }

  // gapMs: 直近の probe から次の probe までの間隔。nextAttempt: その probe の後に使う delay の添字。
  function arm(gapMs: number, nextAttempt: number) {
    clear()
    const waitMs = Math.min(gapMs, Math.max(0, lastProbeAt + gapMs - Date.now()))
    onEvent?.('wait', waitMs)
    timer = setTimeout(() => {
      timer = null
      lastProbeAt = Date.now()
      onEvent?.('probe', 0)
      // 次の待ちを先に張ってから onProbe を呼ぶ: onProbe の中で stop() されても生き返らない。
      arm(connErrorReprobeDelayMs(nextAttempt, random()), nextAttempt + 1)
      onProbe()
    }, waitMs)
  }

  return {
    start(mode) {
      if (mode === 'enter') arm(connErrorReprobeDelayMs(0, random()), 1)
      else arm(CONN_REPROBE_BASE_MS, 0)
    },
    stop() {
      if (clear()) onEvent?.('stop', 0)
    },
    isRunning() {
      return timer != null
    },
  }
}

/**
 * メンテ中の次の再確認までの待ち。
 * - 端末時刻が CLASS の帯（2:00〜4:00）の中: 明け - 今 + floor(rand * SPREAD)（入った時刻は見ない）。
 * - 帯の外（臨時メンテ・明けの遅れ・時刻帯が日本でない端末）: max(0, 入った時刻 + 60秒 - 今)。
 *   ここは変更前の60秒間隔と同じ。回数によるバックオフを持ち込まない（probe のたびに checking へ抜けて
 *   戻るので「抜けたら0へ」が毎回働き、競合バックオフで踏んだ 0↔1 往復の罠になる＝設計 §6 Q5）。
 *   上側の clamp（60秒）は端末の時計が戻った時だけ効く。
 */
export function maintenanceReprobeDelayMs(now: Date, enteredAt: number, rand: number): number {
  const end = maintenanceEndAt(now, 'class')
  if (end) {
    const r = Number.isNaN(rand) ? 0 : rand
    return end.getTime() - now.getTime() + Math.floor(r * MAINTENANCE_END_SPREAD_MS)
  }
  return Math.min(
    MAINTENANCE_REPROBE_MS,
    Math.max(0, enteredAt + MAINTENANCE_REPROBE_MS - now.getTime()),
  )
}

/**
 * 'background' だけ false。'active'・'inactive'・'unknown'・null・undefined は true（fail-open）。
 * 'inactive' で止めないのは、iOS で機内モードを切るのはコントロールセンターの中＝'inactive' の間で、
 * 止めると回線復帰の契機を捨てるため（設計 §4.1 の注）。本当に背面へ行く時は 'background' が来る。
 */
export function isForegroundAppState(s: string | null | undefined): boolean {
  return s !== 'background'
}
