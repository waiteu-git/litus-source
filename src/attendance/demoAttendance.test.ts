import { describe, it, expect, vi } from 'vitest'
import { demoOverrides, demoWindow, DEMO_ATTENDANCE_COURSE } from './demoAttendance'

const NOW = new Date('2026-09-16T13:05:00+09:00')

describe('demoOverrides', () => {
  it('未出席なら受付中に見える（審査員が送信ボタンに到達できる）', () => {
    const o = demoOverrides(null, () => {}, NOW)
    expect(o.reception?.status).toBe('accepting')
    expect(o.reception?.accepting).toBe(true)
    expect(o.reception?.courseName).toBe(DEMO_ATTENDANCE_COURSE)
    expect(o.reception?.confirmWindow).toBe(demoWindow(NOW))
    expect(o.phase).toBe('ready')
    expect(o.attendedNow).toBe(false)
    expect(o.result).toBeNull()
  })

  it('出席後は成功状態に遷移する', () => {
    const rec = {
      date: '2026-05-11',
      courseName: DEMO_ATTENDANCE_COURSE,
      confirmWindow: demoWindow(NOW),
      code: '1234',
    }
    const o = demoOverrides(rec, () => {}, NOW)
    expect(o.phase).toBe('result')
    expect(o.reception?.status).toBe('attended')
    expect(o.reception?.accepting).toBe(false)
    expect(o.attendedNow).toBe(true)
    expect(o.result?.ok).toBe(true)
    expect(o.attended).toEqual(rec)
  })

  it('渡された submit をそのまま返す（実送信経路を上書きする）', () => {
    const spy = vi.fn()
    const o = demoOverrides(null, spy, NOW)
    o.submit?.()
    expect(spy).toHaveBeenCalledOnce()
  })

  it('エラー・競合状態を出さない（デモで警告が出ると審査員が誤認する）', () => {
    const o = demoOverrides(null, () => {}, NOW)
    expect(o.reception?.error).toBeNull()
    expect(o.reception?.network).toBe('on')
    expect(o.conflict).toBe(false)
    expect(o.conflictExhausted).toBe(false)
    expect(o.failCount).toBe(0)
  })

  it('受付窓が now を跨ぐ（受付中ピルと受付終了カウントダウンの矛盾を防ぐ）', () => {
    // 画面は confirmWindow から残り時間を計算する。固定窓だとその時刻を外れた瞬間に
    // 「受付中」と「受付終了」が同時に出る。
    const w = demoWindow(NOW)
    const [from, to] = w.split('〜')
    expect(from < '13:05').toBe(true)
    expect(to > '13:05').toBe(true)
  })

  it('running を偽らない（SyncProviderが「授業中」と誤判定して確認ダイアログを出すため）', () => {
    expect(demoOverrides(null, () => {}, NOW).running).toBeUndefined()
  })
})
