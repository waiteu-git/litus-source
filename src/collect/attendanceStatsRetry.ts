/**
 * 出欠状況の背景取得を「この起動でいま試みるべきか」を決める純粋関数（RN非依存・vitest可能）。
 *
 * 背景（2026-07-18 修正・多角レビューで反証通過した根本原因）:
 * v97 では onAttendanceStatsFinished が収集の**成否問わず** once-per-boot フラグを立てていた。
 * 起動直後の背景トリガが 0 件で終わるとフラグが立ち、以後フォアグラウンド復帰までリセットされない。
 * アプリを開きっぱなしで授業外にいる典型状況では復帰イベントが来ず、**二度と自動取得しなくなる**
 * （ユーザー報告「一度取得できないとずっと取得できない」の主因）。掲示は失敗時に syncSession を
 * 触らないため同症状が出ていなかった。
 *
 * 修正方針:
 * - **成功したときだけ**「この起動は完了」とみなす（succeededThisBoot）。
 * - 失敗は打ち切らず、**間隔（12分）を空けて最大回数（5回）まで再試行**する。
 *   間隔・回数の上限で、毎回失敗する端末でも CLASS を叩き続けない（[[litus-load-audit-2026-07-13]]）。
 * 実際の収集可否（授業中・オフライン・メンテ帯・鮮度TTL）は runner 側 decideClassSync が判定する。
 * ここは「そもそも次の試行機会を与えてよいか」だけを決める。
 */

/** 失敗後、次の試行までの最短間隔。前面滞在中でもこの間隔で回復の機会を与える。 */
export const ATTENDANCE_STATS_RETRY_INTERVAL_MS = 12 * 60 * 1000 // 12分
/** この起動での最大試行回数。毎回失敗する端末での無限リトライを防ぐ（復帰・手動で reset）。 */
export const ATTENDANCE_STATS_MAX_ATTEMPTS = 5

/**
 * プロセス寿命の背景試行総数の天井（復帰でも成功でもリセットしない）。
 *
 * なぜ別建ての上限が要るか:
 * attempts / lastAttemptAt はフォアグラウンド復帰でゼロに戻る（授業後・長時間経過後に取り直すための
 * 正当な機能）。だが復帰直後は lastAttemptAt=null で間隔ゲートが開くため、**リセットのたびに throttle
 * ゼロで CLASS を1回叩ける**。アプリを病的に連続で出し入れすると、復帰回数ぶん無制限に背景アクセスが
 * 立ちうる（日次/プロセス寿命の天井が無い）。それを有界化するのがこの累積上限。
 *
 * 値の根拠（50 ＝「数十回」・[[litus-load-audit-2026-07-13]] 一般ユーザー 130-170req/日 と整合）:
 * - 正常利用: 成功すれば鮮度TTL(6h)が背景取得を最大4回/日程度に抑える。失敗が続く端末でも、正常な
 *   復帰頻度（1日に数コマ分＝せいぜい十数回の前面復帰）では1プロセス寿命でも数十に届かず**絶対に
 *   当たらない**（モバイルはプロセスが1日程度で再生成され自然にリセットされる）。
 * - 病的操作: 短時間に数十回の出し入れを繰り返すと 50 で頭打ちになり、以降この起動では背景自動取得を
 *   停止する。手動(source==='user')は数えないのでユーザーはいつでも手動取得でき、実プロセス再起動で
 *   自然に解除される＝打ち切りは非破壊（v97「一度失敗するとずっと取れない」の再来にはならない）。
 */
export const ATTENDANCE_STATS_MAX_LIFETIME_ATTEMPTS = 50

export type AttendanceStatsAttemptState = {
  /** 収集が成功して確定したか。**成功時のみ true**（失敗では立てない）。 */
  succeededThisBoot: boolean
  /** この起動で開始した試行回数（成功・失敗を問わない）。復帰・手動成功でリセットされる。 */
  attempts: number
  /** 直近の試行開始時刻（epoch ms、未試行は null）。 */
  lastAttemptAt: number | null
  /**
   * プロセス寿命の背景試行総数（成功・失敗を問わない）。**復帰でも成功でもリセットしない**負荷天井用。
   * attempts と違い、フォアグラウンド復帰のスロットル解除を跨いで積み上がる。
   */
  lifetimeAttempts: number
  now: number
}

export function shouldAttemptAttendanceStats(s: AttendanceStatsAttemptState): boolean {
  if (s.succeededThisBoot) return false
  // 復帰でも成功でも解除されない負荷天井。復帰リセットによるスロットル空回しを有界化する（最優先で判定）。
  if (s.lifetimeAttempts >= ATTENDANCE_STATS_MAX_LIFETIME_ATTEMPTS) return false
  if (s.attempts >= ATTENDANCE_STATS_MAX_ATTEMPTS) return false
  if (s.lastAttemptAt != null && s.now - s.lastAttemptAt < ATTENDANCE_STATS_RETRY_INTERVAL_MS) return false
  return true
}
