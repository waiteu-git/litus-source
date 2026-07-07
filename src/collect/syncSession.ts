/**
 * この起動でLETUSフル同期（コース→スナップショット→課題）を完走したかのプロセス内フラグ。
 * 初回セットアップ（ゲートのsyncフェーズ）が完走したら、入場後のBackgroundLetusSyncは重複
 * 実行しない。アプリ再起動でリセットされる（永続化しない）。
 */
export const syncSession = { didFullSync: false }
