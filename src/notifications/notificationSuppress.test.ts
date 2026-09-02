import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  shouldSuppressNotifications,
  resolveNotificationSuppression,
  isKillSwitchReleased,
} from './notificationSuppress'
import type { KillSwitchCache } from '../storage/killSwitchSerialize'

function cache(over: { disabledAll?: boolean; build?: number | null } = {}): KillSwitchCache {
  return {
    status: {
      disabledAll: over.disabledAll ?? true,
      disabled: [],
      message: null,
      title: null,
      calendar: null,
    },
    fetchedAt: 1_700_000_000_000,
    build: over.build === undefined ? 210 : over.build,
  }
}

describe('shouldSuppressNotifications', () => {
  it('自ビルド向けの all 停止は予約を止める', () => {
    expect(shouldSuppressNotifications(cache({ disabledAll: true, build: 210 }), 210)).toBe(true)
  })

  it('キャッシュ無し（新規インストール）は止めない＝従来どおり予約する', () => {
    expect(shouldSuppressNotifications(null, 210)).toBe(false)
  })

  it('別ビルドで解決されたキャッシュは無視する（アプリ更新直後に通知だけ黙るのを防ぐ）', () => {
    expect(shouldSuppressNotifications(cache({ disabledAll: true, build: 209 }), 210)).toBe(false)
  })

  it('build 欄が無い旧形式（null）のキャッシュも自ビルドと不一致なら無視する', () => {
    expect(shouldSuppressNotifications(cache({ disabledAll: true, build: null }), 210)).toBe(false)
  })

  it('dev/Expo Go（両方 null）は Provider と同じく一致扱いにする', () => {
    expect(shouldSuppressNotifications(cache({ disabledAll: true, build: null }), null)).toBe(true)
  })

  it('disabled:[] などの告知のみは止めない', () => {
    expect(shouldSuppressNotifications(cache({ disabledAll: false, build: 210 }), 210)).toBe(false)
  })
})

describe('resolveNotificationSuppression', () => {
  it('all 停止のキャッシュを読めたら true', async () => {
    const errs: unknown[] = []
    const r = await resolveNotificationSuppression(async () => cache(), 210, (e) => errs.push(e))
    expect(r).toBe(true)
    expect(errs).toEqual([])
  })

  it('読みが例外を投げても予約は止まらない（fail-open）', async () => {
    const r = await resolveNotificationSuppression(
      async () => {
        throw new Error('storage boom')
      },
      210,
      () => undefined,
    )
    expect(r).toBe(false)
  })

  it('読みの例外を握り潰さず呼び出し側へ渡す', async () => {
    const boom = new Error('storage boom')
    const errs: unknown[] = []
    await resolveNotificationSuppression(
      async () => {
        throw boom
      },
      210,
      (e) => errs.push(e),
    )
    expect(errs).toEqual([boom])
  })

  it('正常な null（新規インストール）は失敗として記録しない', async () => {
    const errs: unknown[] = []
    const r = await resolveNotificationSuppression(async () => null, 210, (e) => errs.push(e))
    expect(r).toBe(false)
    expect(errs).toEqual([])
  })
})

describe('isKillSwitchReleased', () => {
  it('停止から解除への遷移だけを検知する', () => {
    expect(isKillSwitchReleased(true, false)).toBe(true)
  })
  it('停止のままは遷移ではない', () => {
    expect(isKillSwitchReleased(true, true)).toBe(false)
  })
  it('もともと停止していなければ遷移ではない', () => {
    expect(isKillSwitchReleased(false, false)).toBe(false)
  })
  it('直前の状態が不明（未取得）なら叩かない', () => {
    expect(isKillSwitchReleased(null, false)).toBe(false)
  })
})

/**
 * 関門の配線ラチェット。`refreshAllNotifications` は AsyncStorage を引き込むため vitest から
 * 読めない（同ファイルのコメントが明記）ので、**関門が正しい位置に在ること**をソース順序で固定する。
 * 出席・課題・各回イベントの3計算より前で return していれば、どれも予約されない。
 */
describe('refreshAllNotifications の関門配線', () => {
  const src = readFileSync(join(__dirname, 'notificationRefresh.ts'), 'utf8')
  const at = (needle: string): number => {
    const i = src.indexOf(needle)
    expect(i, `${needle} が notificationRefresh.ts に見つからない`).toBeGreaterThanOrEqual(0)
    return i
  }

  it('停止判定はデモの早期 return より後にある（デモ中は OS 予約に触れない が先）', () => {
    expect(at('resolveNotificationSuppression(')).toBeGreaterThan(at('isDemoNamespace()'))
  })

  it('停止中は出席・課題・各回イベントのいずれも計算されない＝予約されない', () => {
    const gate = at('resolveNotificationSuppression(')
    expect(gate).toBeLessThan(at('loadTimetable()'))
    expect(gate).toBeLessThan(at('computeAttendanceAlarms(collections'))
    expect(gate).toBeLessThan(at('computeNotificationSchedule(toSchedulable'))
    expect(gate).toBeLessThan(at('classEventNotifications(classEvents'))
  })

  it('停止時は既存の同期2本へ空配列を渡して全キャンセルする（新APIを作らない）', () => {
    expect(src).toContain('syncAttendanceAlarms([])')
    expect(src).toContain('syncAssignmentReminders([])')
  })

  it('kill の読みは暦（loadCourseTermInfo）の catch に相乗りしない', () => {
    // 暦側の catch は「読めなければ暦なし」に倒す設計。kill を混ぜると
    // 「停止指示が無い」と「読めなかった」が区別できなくなる。
    const term = src.indexOf('async function loadCourseTermInfo')
    const termEnd = src.indexOf('\n}', term)
    expect(src.slice(term, termEnd)).not.toContain('shouldSuppressNotifications')
    expect(src.slice(term, termEnd)).not.toContain('resolveNotificationSuppression')
  })
})

/**
 * 解除の検知（設計 §4-Q1）とその置き場所のラチェット。`KillSwitchProvider` は React/RN を
 * 引き込むため vitest から読めないので、配線の要点をソースで固定する。
 */
describe('解除の検知の配線', () => {
  const provider = readFileSync(join(__dirname, '..', 'health', 'KillSwitchProvider.tsx'), 'utf8')
  const app = readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf8')

  it('Provider が解除を検知して関門を1回叩く', () => {
    expect(provider).toContain('isKillSwitchReleased(')
    expect(provider).toContain('refreshAllNotifications(')
  })

  it('関門を叩くのはキャッシュ保存の後（先に叩くと古い"停止"を読んで再び全キャンセルする）', () => {
    expect(provider.indexOf('refreshAllNotifications(')).toBeGreaterThan(
      provider.indexOf('saveKillSwitchCache('),
    )
  })

  it('🔴 通知の購読は App.tsx 側（Provider の外）に残っている', () => {
    // 内側へ移すと all 停止中に購読ごと消え、解除しても二度と貼り直されない。
    expect(app).toContain("subscribeForeground('notifications'")
    expect(provider).not.toContain("subscribeForeground('notifications'")
  })

  it('画面と通知の build ガードは同じ取得元を使う（片方だけ効いて食い違わない）', () => {
    const refresh = readFileSync(join(__dirname, 'notificationRefresh.ts'), 'utf8')
    expect(provider).toContain("from './appBuild'")
    expect(refresh).toContain("from '../health/appBuild'")
  })
})
