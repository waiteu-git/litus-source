/**
 * 学外警告の「再確認」が、実際にCLASSからページを取り直す配線になっていることを止めるラチェット（2026-09-29）。
 *
 * 不具合: 出席画面を開いたまま学内Wi-Fiへ切り替えても警告が消えなかった。再確認が呼ぶ refreshAttendance() は、
 * 既に出席ページに居ると何もしない（着地ガード）ので、古いDOMを読み直すだけだった（2026-07-14 の導入時に
 * 「実機検証項目」とされたまま未検証）。単体テストは関数の中身しか見ないので、配線をソースで縛る。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const provider = readFileSync('src/attendance/AttendanceEngineProvider.tsx', 'utf8')
const screen = readFileSync('src/screens/AttendanceScreen.tsx', 'utf8')

describe('🔴 学外警告の「再確認」はCLASSからページを取り直す', () => {
  it('画面の再確認は refreshAttendance ではなく recheckNetwork（再表示の注入）を呼ぶ', () => {
    const fn = screen.slice(screen.indexOf('function recheckNetwork() {'))
    const body = fn.slice(0, fn.indexOf('\n  }\n'))
    expect(body).toContain('engine.recheckNetwork()')
    expect(body).not.toContain('refreshAttendance()')
  })

  it('エンジンは recheckNetwork で「再表示する」を押す注入を撃ち、その後に検出する', () => {
    const fn = provider.slice(provider.indexOf('function recheckNetwork() {'))
    const body = fn.slice(0, fn.indexOf('\n  }\n'))
    expect(body).toContain('inject(REDISPLAY_ATTENDANCE_JS)')
    expect(body).toContain('inject(DETECT_ATTENDANCE_JS)')
    expect(body.indexOf('REDISPLAY_ATTENDANCE_JS')).toBeLessThan(body.indexOf('DETECT_ATTENDANCE_JS'))
  })

  it('再表示ボタンが見つからない通知（redisplay-missing）では WebView を作り直す（最終手段）', () => {
    const nav = provider.slice(provider.indexOf("if (parsed.type === 'nav') {"))
    const branch = nav.slice(0, nav.indexOf("if (parsed.type === 'reaction')"))
    expect(branch).toContain("'redisplay-missing'")
    expect(branch).toContain('rebootWebview()')
  })

  it('作り直しは、再確認を押した直後のときだけ・利用者の操作中や送信中は行わない', () => {
    const nav = provider.slice(provider.indexOf("if (parsed.type === 'nav') {"))
    const branch = nav.slice(0, nav.indexOf("if (parsed.type === 'reaction')"))
    expect(branch).toContain('recheckPendingRef.current')
    for (const guard of ['revealClassRef.current', 'reactionBusyRef.current', "phaseRef.current !== 'submitting'", 'conflictRef.current']) {
      expect(branch).toContain(guard)
    }
  })

  it('context に recheckNetwork を公開する', () => {
    expect(provider).toMatch(/recheckNetwork: \(\) => void/)
    expect(provider).toMatch(/\n\s+recheckNetwork,\n/)
  })

  it('定期ポーリングと前面復帰は従来どおり refreshAttendance のまま（再表示ボタンを30秒ごとに押さない＝CLASS負荷）', () => {
    expect(provider).not.toMatch(/setInterval\([\s\S]{0,700}recheckNetwork\(\)/)
    const fg = provider.slice(provider.indexOf("subscribeForeground('attendance'"), provider.indexOf('// 出席ページ滞在中は定期的に'))
    expect(fg).not.toContain('recheckNetwork')
  })
})
