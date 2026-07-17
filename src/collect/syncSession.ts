/**
 * この起動での同期状態（プロセス内・永続化しない）。
 * - didFullSync: 「今この瞬間、LETUS再同期不要か」。lastFullSyncAtは最後に完走したエポックms。
 *   フォアグラウンド復帰で一定時間経過していれば BackgroundLetusSync が didFullSync を落として
 *   再同期を許可する（起動中の鮮度維持）。
 * - bulletinSyncedThisBoot: この起動で掲示同期が**完走**したか。SyncProvider の完了処理で立てる
 *   （開始時に立てると途中破棄＝kill switch等で once-per-boot を空費する）。
 * - attendanceStatsSyncedThisBoot: 出欠版の同じもの（掲示と同契約）。
 */
export const syncSession: {
  didFullSync: boolean
  lastFullSyncAt: number | null
  bulletinSyncedThisBoot: boolean
  attendanceStatsSyncedThisBoot: boolean
} = {
  didFullSync: false,
  lastFullSyncAt: null,
  bulletinSyncedThisBoot: false,
  attendanceStatsSyncedThisBoot: false,
}
