/**
 * portalAction が出席エンジンの配線に入っていることを止めるラチェット（2026-09-11）。
 *
 * 不具合は判定（classifyClassPage）ではなく配線にあった: portal の一手が利用者の操作中・リアペ提出中にも
 * 無条件に出席ページを開き直し、②（リアペ提出ページ）を開いた直後に①へ引き戻していた。
 * portalAction の単体テストは関数を消されても配線から外されても緑のままなので、配線をソースで見る。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync('src/attendance/AttendanceEngineProvider.tsx', 'utf8')

describe('🔴 出席エンジンは利用者の操作中・リアペ提出中に画面を奪わない', () => {
  it("portal の分岐は、出席ページを開き直す前に portalAction で留まるかを決める", () => {
    const branch = src.slice(src.indexOf("} else if (kind === 'portal') {"))
    const guard = branch.indexOf('portalAction({ revealClass: revealClassRef.current, reactionBusy: reactionBusyRef.current })')
    const open = branch.indexOf('inject(OPEN_ATTENDANCE_JS)')
    expect(guard).toBeGreaterThan(0)
    expect(open).toBeGreaterThan(guard)
  })
  it('前面復帰と定期取り直しも revealClass を見る（取り直し＝出席ページへの遷移）', () => {
    expect(src).toMatch(/reactionBusyRef\.current \|\| revealClassRef\.current \|\| !shouldRenderRef\.current\) return/)
    expect(src).toMatch(/!revealClassRef\.current \/\/ CLASSの画面を利用者が操作中/)
  })
  it('導線の時間切れも、見ている間は WebView を作り直さない（張り直して閉じた後へ持ち越す）', () => {
    const fn = src.slice(src.indexOf('function onNavTimeout() {'))
    const guard = fn.indexOf('if (revealClassRef.current) {')
    const reboot = fn.indexOf('setWebviewKey(')
    expect(guard).toBeGreaterThan(0)
    expect(reboot).toBeGreaterThan(guard)
  })
  it('revealClass の書き込みは ref と state を同時に更新する関数を通す（素の setter を context に出さない）', () => {
    expect(src).toMatch(/const \[revealClass, setRevealClassState\] = useState\(false\)/)
    expect(src).not.toMatch(/const \[revealClass, setRevealClass\] = useState/)
  })
})
