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
 */
export const syncSession: {
  didFullSync: boolean
  lastFullSyncAt: number | null
  bulletinSyncedThisBoot: boolean
  attendanceStatsSyncedThisBoot: boolean
  attendanceStatsAttempts: number
  attendanceStatsLastAttemptAt: number | null
} = {
  didFullSync: false,
  lastFullSyncAt: null,
  bulletinSyncedThisBoot: false,
  attendanceStatsSyncedThisBoot: false,
  attendanceStatsAttempts: 0,
  attendanceStatsLastAttemptAt: null,
}
