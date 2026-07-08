/**
 * この起動でのLETUSフル同期状態。didFullSyncは「今この瞬間、再同期不要か」。
 * lastFullSyncAtは最後に完走したエポックms。フォアグラウンド復帰で一定時間経過していれば
 * BackgroundLetusSyncがdidFullSyncを落として再同期を許可する（起動中の鮮度維持）。永続化しない。
 */
export const syncSession: { didFullSync: boolean; lastFullSyncAt: number | null } = {
  didFullSync: false,
  lastFullSyncAt: null,
}
