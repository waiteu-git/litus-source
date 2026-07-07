import { describe, expect, it } from 'vitest'
import { attendanceReducer, initialEngineState, overlayVisible } from './engine'
import type { AttendanceReception } from '../collect/attendanceMessage'

const reception: AttendanceReception = {
  accepting: true, courseName: '基礎電気工学', confirmWindow: '12:50〜14:30', remaining: 'あと91分', error: null,
}

describe('attendanceReducer', () => {
  it('page login で needsLogin', () => {
    const s = attendanceReducer(initialEngineState, { kind: 'page', page: 'login' })
    expect(s.phase).toBe('needsLogin')
  })
  it('reception で ready＋受付状況を保持', () => {
    const s = attendanceReducer(initialEngineState, { kind: 'reception', reception })
    expect(s.phase).toBe('ready')
    expect(s.reception?.courseName).toBe('基礎電気工学')
  })
  it('submitStart→submitResult で submitting→result', () => {
    let s = attendanceReducer({ ...initialEngineState, phase: 'ready', reception }, { kind: 'submitStart' })
    expect(s.phase).toBe('submitting')
    s = attendanceReducer(s, { kind: 'submitResult', result: { result: '出席登録しました', ok: true, wrong: false, err: false } })
    expect(s.phase).toBe('result')
    expect(s.result?.ok).toBe(true)
    expect(s.reception?.courseName).toBe('基礎電気工学')
  })
  it('navTimeout は ready のときは無視', () => {
    const ready = { ...initialEngineState, phase: 'ready' as const, reception }
    expect(attendanceReducer(ready, { kind: 'navTimeout' }).phase).toBe('ready')
  })
  it('navTimeout は booting のとき navFailed', () => {
    expect(attendanceReducer(initialEngineState, { kind: 'navTimeout' }).phase).toBe('navFailed')
  })
  it('retry で booting に戻り結果クリア', () => {
    const s = attendanceReducer({ phase: 'result', reception, result: { result: 'x', ok: false, wrong: true, err: false } }, { kind: 'retry' })
    expect(s.phase).toBe('booting')
    expect(s.result).toBeNull()
  })
  it('overlayVisible は needsLogin/navFailed のみ true', () => {
    expect(overlayVisible('needsLogin')).toBe(true)
    expect(overlayVisible('navFailed')).toBe(true)
    expect(overlayVisible('ready')).toBe(false)
  })
  it('needsLogin中に非ログインページ(portal)を検知したら booting へ復帰', () => {
    const s = attendanceReducer({ ...initialEngineState, phase: 'needsLogin' }, { kind: 'page', page: 'portal' })
    expect(s.phase).toBe('booting')
  })
  it('navFailed中に attendance を検知したら booting へ復帰', () => {
    const s = attendanceReducer({ ...initialEngineState, phase: 'navFailed' }, { kind: 'page', page: 'attendance' })
    expect(s.phase).toBe('booting')
  })
  it('reboot は booting に戻すが reception は保持する（タブ再訪のキャッシュ表示用）', () => {
    const start = {
      phase: 'ready' as const,
      reception,
      result: { result: 'x', ok: true, wrong: false, err: false },
    }
    const s = attendanceReducer(start, { kind: 'reboot' })
    expect(s.phase).toBe('booting')
    expect(s.reception).toBe(reception)
    expect(s.result).toBeNull()
  })
  it('errorPage で navFailed へ（自動復帰1回を使い切った後の最終フォールバック）', () => {
    const s = attendanceReducer({ ...initialEngineState, phase: 'ready' }, { kind: 'errorPage' })
    expect(s.phase).toBe('navFailed')
  })
  it('result表示中のreceptionは結果を消さずphaseを維持', () => {
    const start = { phase: 'result' as const, reception, result: { result: '出席登録しました', ok: true, wrong: false, err: false } }
    const s = attendanceReducer(start, { kind: 'reception', reception })
    expect(s.phase).toBe('result')
    expect(s.result?.ok).toBe(true)
  })
})
