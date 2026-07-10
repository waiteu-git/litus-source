import { describe, expect, it } from 'vitest'
import { collectEarlyAction, type CollectSignal } from './collectFlow'

const sig = (over: Partial<CollectSignal> = {}): CollectSignal => ({
  hasPasswordInput: false,
  hasAttendanceForm: false,
  hasEnterSplash: false,
  hasClassMenu: false,
  hasSystemError: false,
  hasMultiScreen: false,
  ...over,
})

describe('collectEarlyAction', () => {
  it('PC等の他画面と競合(conflict)は abort（ロック解放）', () => {
    expect(collectEarlyAction(sig({ hasMultiScreen: true }))).toBe('abort')
  })
  it('メンテナンス中は abort', () => {
    expect(collectEarlyAction(sig({ hasMaintenance: true }))).toBe('abort')
  })
  it('システムエラーは reboot', () => {
    expect(collectEarlyAction(sig({ hasSystemError: true }))).toBe('reboot')
  })
  it('SSOトークン失効は reboot', () => {
    expect(collectEarlyAction(sig({ hasSsoStale: true }))).toBe('reboot')
  })
  it('ログイン画面は continue（cookieで自動リダイレクトを待つ）', () => {
    expect(collectEarlyAction(sig({ hasPasswordInput: true }))).toBe('continue')
  })
  it('入口スプラッシュは continue', () => {
    expect(collectEarlyAction(sig({ hasEnterSplash: true }))).toBe('continue')
  })
  it('CLASSポータル（出欠管理メニュー）は continue', () => {
    expect(collectEarlyAction(sig({ hasClassMenu: true }))).toBe('continue')
  })
  it('該当なし（遷移途中）は continue', () => {
    expect(collectEarlyAction(sig())).toBe('continue')
  })
  it('競合はエラーより優先（両方立っても abort）', () => {
    expect(collectEarlyAction(sig({ hasMultiScreen: true, hasSystemError: true }))).toBe('abort')
  })
})
