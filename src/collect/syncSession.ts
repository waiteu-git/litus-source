/**
 * この起動での同期状態（プロセス内・永続化しない）。
 * - didFullSync: 「今この瞬間、LETUS再同期不要か」。lastFullSyncAtは最後に完走したエポックms。
 *   フォアグラウンド復帰で一定時間経過していれば BackgroundLetusSync が didFullSync を落として
 *   再同期を許可する（起動中の鮮度維持）。
 * - bulletinSyncedThisBoot: この起動で掲示同期が**完走**したか。SyncProvider の完了処理で立てる
 *   （開始時に立てると途中破棄＝kill switch等で once-per-boot を空費する）。
 * - attendanceStatsSyncedThisBoot: 出欠が**成功**したか。**成功時のみ true**（掲示と違い失敗では
 *   立てない）。v97 で失敗でも立てていたため、開きっぱなしだと二度と自動取得しなかった（2026-07-18修正）。
 * - attendanceStatsAttempts / attendanceStatsLastAttemptAt: 失敗時の再試行制御（間隔＋最大回数）。
 *   shouldAttemptAttendanceStats が参照する。復帰・手動成功でリセットする。
 * - attendanceStatsLifetimeAttempts: プロセス寿命の背景試行総数（負荷天井）。**復帰でも成功でも
 *   リセットしない**（attendanceStatsAttempts とは別建て）。復帰リセットで attempts がゼロに戻ると
 *   間隔ゲートも開くため、病的な連続出し入れでは throttle ゼロで CLASS を叩けてしまう。それを
 *   プロセス寿命で有界化する（shouldAttemptAttendanceStats が上限で打ち切る。実プロセス再起動で
 *   自然にリセットされるので永続化は不要）。
 */
export const syncSession: {
  didFullSync: boolean
  lastFullSyncAt: number | null
  bulletinSyncedThisBoot: boolean
  attendanceStatsSyncedThisBoot: boolean
  attendanceStatsAttempts: number
  attendanceStatsLastAttemptAt: number | null
  attendanceStatsLifetimeAttempts: number
} = {
  didFullSync: false,
  lastFullSyncAt: null,
  bulletinSyncedThisBoot: false,
  attendanceStatsSyncedThisBoot: false,
  attendanceStatsAttempts: 0,
  attendanceStatsLastAttemptAt: null,
  attendanceStatsLifetimeAttempts: 0,
}
