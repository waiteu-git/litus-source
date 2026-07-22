import { describe, it, expect } from 'vitest'
import { notificationPermissionAction, notificationPermissionNotice } from './permissionState'

describe('notificationPermissionAction', () => {
  it('取得できない（Expo Go / モジュール不在）なら何も出さない', () => {
    expect(notificationPermissionAction(null)).toBe('none')
    expect(notificationPermissionAction(undefined)).toBe('none')
  })

  it('許可済みなら何も出さない', () => {
    expect(
      notificationPermissionAction({ status: 'granted', granted: true, canAskAgain: true }),
    ).toBe('none')
  })

  it('未要求（undetermined）は再要求できる', () => {
    expect(
      notificationPermissionAction({ status: 'undetermined', granted: false, canAskAgain: true }),
    ).toBe('request')
  })

  /**
   * Android 13+ の新規インストールは POST_NOTIFICATIONS 未付与＝areNotificationsEnabled() が
   * false なので、**まだ一度も聞いていなくても status は 'denied'** になる
   * （NotificationPermissionsModule.kt の status 判定順）。
   * status で「未要求」を見分けようとすると初回要求ごと死ぬので granted+canAskAgain で分岐する。
   */
  it('未要求でも denied になる Android 13+ の新規インストールを request として扱う', () => {
    expect(
      notificationPermissionAction({ status: 'denied', granted: false, canAskAgain: true }),
    ).toBe('request')
  })

  it('2回拒否（canAskAgain=false）は OS 設定へ誘導するしかない', () => {
    expect(
      notificationPermissionAction({ status: 'denied', granted: false, canAskAgain: false }),
    ).toBe('openSettings')
  })

  /**
   * 権限は付与済みだが OS 設定でアプリの通知を全OFFにした状態。
   * granted=true なので再要求してもダイアログは出ない＝request にしてはいけない。
   */
  it('許可済みだがOS設定で通知OFF（granted=true / status=denied）は設定へ誘導', () => {
    expect(
      notificationPermissionAction({ status: 'denied', granted: true, canAskAgain: true }),
    ).toBe('openSettings')
  })
})

describe('notificationPermissionNotice', () => {
  it('none では文言を出さない', () => {
    expect(notificationPermissionNotice('none')).toBeNull()
  })

  it('request の文言', () => {
    expect(notificationPermissionNotice('request')).toEqual({
      body: '通知が許可されていません。締切と出席のお知らせが届きません。',
      cta: '通知を許可',
    })
  })

  it('openSettings の文言', () => {
    expect(notificationPermissionNotice('openSettings')).toEqual({
      body: '端末の設定で通知がオフになっています。締切と出席のお知らせが届きません。',
      cta: '端末の設定を開く',
    })
  })
})
