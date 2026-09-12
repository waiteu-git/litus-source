/**
 * 規約の同意が確定するまで probe WebView を作らないことの配線ラチェット（設計 PC・2026-09-12）。
 *
 * shouldMountGateProbe の単体テストは、LoginGate が関数を呼ばなくなっても、WebView を条件の外へ
 * 出しても緑のままなので、配線をソースで見る（先例: src/attendance/portalGuardWiring.test.ts）。
 * R5 は probe 以外で大学へ出る子（children＝AuthProvider・収集・出席、LETUS の初回同期）が、同意の後の
 * 置き場から動いていないことを見る（掲載文「利用規約に同意いただくまで…始まりません」の残りの根拠）。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync('src/auth/LoginGate.tsx', 'utf8')
const app = readFileSync('App.tsx', 'utf8')

/** `{probeMounted ? (` から、それに続く最初の `) : null}` までを切り出す（条件付きマウントの中身）。 */
function probeBlock(): string {
  const start = src.indexOf('{probeMounted ? (')
  if (start < 0) return ''
  const end = src.indexOf(') : null}', start)
  return end < 0 ? '' : src.slice(start, end)
}

describe('🔴 規約の同意が確定するまで probe WebView を作らない（設計 PC）', () => {
  it('R1 マウントの可否は shouldMountGateProbe(state) だけで決める', () => {
    expect(src).toMatch(/^import \{ shouldMountGateProbe \} from '\.\/gateProbeMount'$/m)
    // 行末まで一致させる（`|| 何か` を足して条件を緩める変更も落とす）
    expect(src).toMatch(/^  const probeMounted = shouldMountGateProbe\(state\)$/m)
  })

  it('R2 CLASS の入口を開く WebView は probeMounted の条件の内側にだけある', () => {
    const block = probeBlock()
    expect(block).toContain('<WebView')
    expect(block).toContain('key={nonce}')
    expect(block).toContain('source={{ uri: `${CLASS_PC_LOGIN_URL}?litus=${nonce}` }}')
    expect(src.split('CLASS_PC_LOGIN_URL}?litus=').length - 1).toBe(1)
  })

  it('R3 LoginGate の WebView は probe と起動ロゴ（ローカル HTML）の2つだけ', () => {
    // useRef<WebViewInstance> は数えない（開きタグだけを数える）
    expect(src.match(/<WebView[\s>]/g) ?? []).toHaveLength(2)
    const logoAt = src.indexOf('<WebView', src.indexOf('{bootMode != null ? ('))
    expect(src.slice(logoAt, logoAt + 200)).toMatch(/source=\{\{ html: bootLogoHtml\(/)
  })

  it('R4 requireLogin は同意の確定前に何もしない（checking へ移して規約画面を飛ばさない）', () => {
    const fn = src.slice(src.indexOf('function requireLogin() {'))
    const body = fn.slice(0, fn.indexOf('\n  }\n'))
    // 字下げ込みの1行で探す（コメントアウトした形を数えない）
    const guard = body.indexOf('\n    if (!shouldMountGateProbe(stateRef.current)) return\n')
    expect(guard).toBeGreaterThan(0)
    expect(body.indexOf('setNonce(')).toBeGreaterThan(guard)
    expect(body.indexOf("setState('checking')")).toBeGreaterThan(guard)
  })

  it('R5 probe 以外で大学へ出る子は同意の後の置き場から動かない（children は入場後・LetusSyncEngine は sync の中・AuthProvider と収集は LoginGate の内側）', () => {
    // children（AuthProvider・収集・出席のエンジン）は `if (state === 'authed' && bootReady) {` の return の中に1回だけ
    const gate = src.indexOf("if (state === 'authed' && bootReady) {")
    const kids = src.indexOf('{children}')
    expect(gate).toBeGreaterThan(0)
    expect(src.split('{children}').length - 1).toBe(1)
    expect(kids).toBeGreaterThan(gate)
    expect(src.indexOf('\n  }\n', gate)).toBeGreaterThan(kids)
    // LETUS の初回同期エンジン（中に WebView を持つ）は sync の条件の内側に1つだけ
    const syncAt = src.indexOf("{state === 'sync' ? (")
    const engineAt = src.indexOf('<LetusSyncEngine')
    expect(syncAt).toBeGreaterThan(0)
    expect(src.split('<LetusSyncEngine').length - 1).toBe(1)
    expect(engineAt).toBeGreaterThan(syncAt)
    expect(src.indexOf(') : null}', syncAt)).toBeGreaterThan(engineAt)
    // App.tsx: デモ以外では AuthProvider と収集（inner）は LoginGate の children としてだけ描く
    expect(app).toMatch(/<LoginGate>\s*<AuthProvider>\{inner\}<\/AuthProvider>\s*<\/LoginGate>/)
    expect(app.split('{inner}').length - 1).toBe(1)
  })
})
