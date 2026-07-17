import { describe, it, expect } from 'vitest'
import { attendanceStatsDiagLine } from './attendanceStatsDiag'
import type { StoredHealth } from '../storage/collectionHealthSerialize'

const now = new Date(2026, 6, 18, 12, 0, 0)
const MIN = 60 * 1000
// 関数は StoredHealth のラッパーではなく内側の CollectionHealth を受ける（第2引数は互換のため無視）。
const h = (health: StoredHealth['health'], _atOffsetMin: number): StoredHealth['health'] => health

describe('attendanceStatsDiagLine', () => {
  it('一度も取得できていないときは、その旨を出す', () => {
    const line = attendanceStatsDiagLine({ health: null, lastSuccessAt: 0, now })
    expect(line).toContain('まだ')
    expect(line).not.toContain('前回')
  })

  it('取得できているときは前回時刻と科目数を出す', () => {
    const line = attendanceStatsDiagLine({
      health: { status: 'ok', count: 12 },
      lastSuccessAt: now.getTime() - 30 * MIN,
      now,
    })
    expect(line).toContain('取得できています')
    expect(line).toContain('30分前')
    expect(line).toContain('12')
  })

  describe('失敗理由を人間可読にする（授業時間外でも取れない切り分け）', () => {
    it('blocked＝授業中の競合／ページ未読込', () => {
      const line = attendanceStatsDiagLine({ health: h({ status: 'blocked' }, 5), lastSuccessAt: 0, now })
      expect(line).toMatch(/競合|読み込み|混雑/)
    })

    it('not_logged_in＝CLASSのログイン切れ', () => {
      const line = attendanceStatsDiagLine({ health: h({ status: 'not_logged_in' }, 5), lastSuccessAt: 0, now })
      expect(line).toContain('ログイン')
    })

    it('structure_drift＝CLASSの画面構成変化', () => {
      const line = attendanceStatsDiagLine({ health: h({ status: 'structure_drift' }, 5), lastSuccessAt: 0, now })
      expect(line).toMatch(/画面|構成|変わっ/)
    })

    it('失敗でも前回成功時刻があれば併記する（いつのデータを見ているか）', () => {
      const line = attendanceStatsDiagLine({
        health: { status: 'blocked' },
        lastSuccessAt: now.getTime() - 3 * 60 * MIN,
        now,
      })
      expect(line).toContain('前回')
      expect(line).toContain('3時間前')
    })
  })

  it('empty_valid（対象授業なし）は異常ではない旨', () => {
    const line = attendanceStatsDiagLine({ health: h({ status: 'empty_valid' }, 5), lastSuccessAt: 0, now })
    expect(line).toBeTruthy()
    expect(line).not.toMatch(/失敗|エラー/)
  })

  it('必ず非空の文字列を返す（設定画面に空行を出さない）', () => {
    for (const s of ['ok', 'empty_valid', 'structure_drift', 'not_logged_in', 'maintenance', 'blocked'] as const) {
      const health = s === 'ok' ? { status: 'ok' as const, count: 1 } : { status: s }
      const line = attendanceStatsDiagLine({ health, lastSuccessAt: 0, now })
      expect(line.length).toBeGreaterThan(0)
    }
    expect(attendanceStatsDiagLine({ health: null, lastSuccessAt: 0, now }).length).toBeGreaterThan(0)
  })
})
