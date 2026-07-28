import { describe, it, expect, beforeEach, vi } from 'vitest'

// AsyncStorage をモック（diagnosticsStateStore.test.ts と同方式）。ファサード経由の
// read-modify-write を実 Storage 実装ごと検証する。
const mockStore: Record<string, string> = {}
const setItem = vi.fn((key: string, value: string) => {
  mockStore[key] = value
  return Promise.resolve()
})
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: (key: string, value: string) => setItem(key, value),
    removeItem: vi.fn((key: string) => {
      delete mockStore[key]
      return Promise.resolve()
    }),
  },
}))

import {
  ATTENDANCE_DONE_KEY,
  loadAttendedRecord,
  saveAttendedRecord,
  scrubExpiredAttendedCode,
} from './attendanceDoneStore'
import { setDemoNamespace } from './asyncStorage'
import type { AttendedRecord } from '../attendance/attendedState'

const rec = (over: Partial<AttendedRecord> = {}): AttendedRecord => ({
  date: '2026-07-07',
  courseName: '哲学',
  confirmWindow: '12:50〜14:30',
  code: '1234',
  ...over,
})
const at = (h: number, m: number) => new Date(2026, 6, 7, h, m) // 2026-07-07

describe('scrubExpiredAttendedCode（監査M-1: 出席コードを永続させない）', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k])
    setItem.mockClear()
    setDemoNamespace(false)
  })

  it('期限切れの既存データは読み込み経路で code が落ち、ストアにも書き戻される', async () => {
    // 「codeが入ったまま期限切れ」の既存データを直接置く（移行前の状態）
    mockStore[ATTENDANCE_DONE_KEY] = JSON.stringify(rec())
    const loaded = await loadAttendedRecord()
    expect(loaded?.code).toBe('1234') // load 自体は素直に読む

    const scrubbed = await scrubExpiredAttendedCode(loaded, at(14, 31), null)
    expect(scrubbed?.code).toBe('')
    // 平文コードが AsyncStorage に残っていない
    expect(mockStore[ATTENDANCE_DONE_KEY]).not.toContain('1234')

    // 出席済み判定に要る項目は残る（再読込でも）
    const reread = await loadAttendedRecord()
    expect(reread).toEqual({
      date: '2026-07-07',
      courseName: '哲学',
      confirmWindow: '12:50〜14:30',
      code: '',
    })
  })

  it('期限内は書き戻さない（AsyncStorage への無駄な書き込みを増やさない）', async () => {
    await saveAttendedRecord(rec())
    setItem.mockClear()
    const scrubbed = await scrubExpiredAttendedCode(rec(), at(13, 0), null)
    expect(scrubbed?.code).toBe('1234')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('既に空コードなら書き戻さない', async () => {
    const r = rec({ code: '' })
    const scrubbed = await scrubExpiredAttendedCode(r, at(14, 31), null)
    expect(scrubbed).toBe(r)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('記録が無ければ何もしない', async () => {
    expect(await scrubExpiredAttendedCode(null, at(14, 31), null)).toBe(null)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('授業終了までの延長中は書き戻さない（表示要件を壊さない）', async () => {
    // 受付は9:20で終了・授業は10:20(=620分)まで
    const r = rec({ confirmWindow: '08:50〜09:20' })
    expect((await scrubExpiredAttendedCode(r, at(10, 0), 620))?.code).toBe('1234')
    expect(setItem).not.toHaveBeenCalled()
    expect((await scrubExpiredAttendedCode(r, at(10, 21), 620))?.code).toBe('')
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('confirmWindow が壊れた既存データも翌日には消える', async () => {
    mockStore[ATTENDANCE_DONE_KEY] = JSON.stringify(rec({ confirmWindow: '受付時間は掲示を確認' }))
    const loaded = await loadAttendedRecord()
    await scrubExpiredAttendedCode(loaded, new Date(2026, 6, 8, 0, 1), null)
    expect(mockStore[ATTENDANCE_DONE_KEY]).not.toContain('1234')
    expect((await loadAttendedRecord())?.confirmWindow).toBe('受付時間は掲示を確認')
  })
})
