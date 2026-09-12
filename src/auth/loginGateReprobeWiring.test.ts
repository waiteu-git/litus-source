/**
 * 起動ゲートの自動 probe の配線ラチェット（2026-09-12・設計 docs/design/2026-09-12-v11-train1-G1.md §7）。
 *
 * 予定（間隔・15秒の床・背面での停止）は gateReprobe.test.ts が本物のコードで確かめる。だが予定表を
 * 配線から外されても、状態機械に手を入れられても、単体テストは緑のままになる。ここは LoginGate.tsx の
 * ソースを読んで、設計の禁止事項1〜7が守られていることを見る（先例 src/attendance/portalGuardWiring.test.ts）。
 *
 * どのルールにも陰性対照を付ける＝ソースを1か所だけ壊した写しで、そのルールが落ちることを確かめる。
 * 実装が緑になった後もラチェットが空振りしていないことを、毎回のテストで検出できる。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync('src/auth/LoginGate.tsx', 'utf8')

const CONN_GUARD = "if (state !== 'connError') return"
const MAINT_GUARD = "if (state !== 'maintenance') return"
const EFFECT_CLOSE = '\n  }, ['

/** guard の行を含む useEffect の本体（`useEffect(() => {` から effect を閉じる行の直前まで）と deps の中身。 */
function effectOf(src: string, guard: string): { body: string; deps: string } | null {
  const at = src.indexOf(guard)
  if (at < 0) return null
  const start = src.lastIndexOf('useEffect(() => {', at)
  const close = src.indexOf(EFFECT_CLOSE, at)
  if (start < 0 || close < 0) return null
  const depsStart = close + EFFECT_CLOSE.length
  return { body: src.slice(start, close), deps: src.slice(depsStart, src.indexOf(']', depsStart)) }
}

const count = (s: string, needle: string) => s.split(needle).length - 1

/** effect の本体だけを書き換えた写し。書き換えが当たらなければ投げる（陰性対照の空振りを防ぐ）。 */
function mutateEffect(src: string, guard: string, f: (body: string) => string): string {
  const e = effectOf(src, guard)
  if (!e) throw new Error(`effect が見つからない: ${guard}`)
  const next = f(e.body)
  if (next === e.body) throw new Error(`陰性対照の書き換えが当たらない: ${guard}`)
  return src.replace(e.body, next)
}

/** effect の deps だけを書き換えた写し。 */
function withDeps(src: string, guard: string, deps: string): string {
  const close = src.indexOf(EFFECT_CLOSE, src.indexOf(guard))
  const depsStart = close + EFFECT_CLOSE.length
  return src.slice(0, depsStart) + deps + src.slice(src.indexOf(']', depsStart))
}

/** src 全体の書き換え。当たらなければ投げる。 */
function mutate(src: string, from: string, to: string): string {
  if (!src.includes(from)) throw new Error(`陰性対照の書き換えが当たらない: ${from}`)
  return src.replace(from, to)
}

/** 名前付きで束ねた購読（`const x = …(`）が、同じ本体の中で解除されているか。 */
function pairedInBody(body: string, call: string, release: (name: string) => string): boolean {
  const re = new RegExp(`const (\\w+) = ${call.replace(/[.()]/g, '\\$&')}`, 'g')
  const names = [...body.matchAll(re)].map((m) => m[1])
  return names.length > 0 && names.every((n) => body.includes(release(n)))
}

type Rule = {
  name: string
  ok: (src: string) => boolean
  /** 陰性対照: このルールだけを破る写し。 */
  broken: (src: string) => string
}

const RULES: Rule[] = [
  {
    name: 'LoginGate に setInterval( が無い（1回撃つたびに次を決める setTimeout の連鎖＝禁止事項7）',
    ok: (src) => count(src, 'setInterval(') === 0,
    broken: (src) => `${src}\nconst leak = setInterval(() => undefined, 15000)\n`,
  },
  {
    name: '再確認の定数は gateReprobe へ移し、LoginGate に定義しない（./gateReprobe を import する）',
    ok: (src) =>
      !/const (CONN_ERROR_REPROBE_MS|MAINTENANCE_REPROBE_MS)\b/.test(src) && src.includes("from './gateReprobe'"),
    broken: (src) =>
      mutate(src, 'const CHECK_TIMEOUT_MS = 12000', 'const CHECK_TIMEOUT_MS = 12000\nconst CONN_ERROR_REPROBE_MS = 15000'),
  },
  {
    name: 'connError の effect は recoverTries を0へ・nonce+1 だけを行い、状態を変えない（禁止事項3）',
    ok: (src) => {
      const e = effectOf(src, CONN_GUARD)
      return (
        !!e &&
        e.body.includes('recoverTriesRef.current = 0') &&
        e.body.includes('setNonce((n) => n + 1)') &&
        !e.body.includes('setState(')
      )
    },
    broken: (src) =>
      mutateEffect(src, CONN_GUARD, (b) => b.replace('setNonce((n) => n + 1)', "setNonce((n) => n + 1)\n        setState('checking')")),
  },
  {
    name: 'maintenance の effect は nonce+1 と maintenance→checking をセットで行う（禁止事項2）',
    ok: (src) => {
      const e = effectOf(src, MAINT_GUARD)
      return (
        !!e &&
        e.body.includes('setNonce((n) => n + 1)') &&
        e.body.includes("setState((s) => (s === 'maintenance' ? 'checking' : s))")
      )
    },
    broken: (src) =>
      mutateEffect(src, MAINT_GUARD, (b) => b.replace("setState((s) => (s === 'maintenance' ? 'checking' : s))", '')),
  },
  {
    name: '2つの effect の deps は [state] だけ（nonce を入れると probe のたびに連鎖が頭へ戻る＝禁止事項4）',
    ok: (src) => effectOf(src, CONN_GUARD)?.deps === 'state' && effectOf(src, MAINT_GUARD)?.deps === 'state',
    broken: (src) => withDeps(src, CONN_GUARD, 'state, nonce'),
  },
  {
    name: 'connError の effect は予定表 createConnErrorReprobe に任せ、自分で setTimeout や ref の時刻を持たない（禁止事項6）',
    ok: (src) => {
      const e = effectOf(src, CONN_GUARD)
      if (!e) return false
      const refs = e.body.match(/\b\w+Ref\.current\b/g) ?? []
      return (
        e.body.includes('createConnErrorReprobe(') &&
        !e.body.includes('setTimeout(') &&
        refs.every((m) => m === 'recoverTriesRef.current')
      )
    },
    broken: (src) =>
      mutateEffect(src, CONN_GUARD, (b) => b.replace('recoverTriesRef.current = 0', 'recoverTriesRef.current = 0\n        lastProbeAtRef.current = Date.now()')),
  },
  {
    name: 'onMessage の判定の2行は不変（maintenance では authed を拾わない＝禁止事項1）',
    ok: (src) =>
      src.includes("if (s === 'checking' || s === 'needsLogin' || s === 'connError') setState('maintenance')") &&
      src.includes("if (s === 'checking' || s === 'connError') {"),
    broken: (src) =>
      mutate(src, "if (s === 'checking' || s === 'connError') {", "if (s === 'checking' || s === 'connError' || s === 'maintenance') {"),
  },
  {
    name: 'useConnectivity を使わない（hook は authed 中も LoginGate を再描画させる＝禁止事項5）',
    ok: (src) => !src.includes('useConnectivity'),
    broken: (src) =>
      mutate(src, 'const insets = useSafeAreaInsets()', 'const insets = useSafeAreaInsets()\n  const online = useConnectivity()'),
  },
  {
    name: 'AppState の購読は2つの effect の中でだけ張り、それぞれ .remove() で外す（禁止事項5）',
    ok: (src) => {
      const c = effectOf(src, CONN_GUARD)
      const m = effectOf(src, MAINT_GUARD)
      if (!c || !m) return false
      const inEffects = (needle: string) => count(src, needle) === count(c.body, needle) + count(m.body, needle)
      return (
        count(c.body, 'AppState.addEventListener(') === 1 &&
        count(m.body, 'AppState.addEventListener(') === 1 &&
        inEffects('AppState.addEventListener(') &&
        inEffects('AppState.currentState') &&
        pairedInBody(c.body, 'AppState.addEventListener(', (n) => `${n}.remove()`) &&
        pairedInBody(m.body, 'AppState.addEventListener(', (n) => `${n}.remove()`)
      )
    },
    broken: (src) => mutateEffect(src, CONN_GUARD, (b) => b.replace('app.remove()', '')),
  },
  {
    name: '回線の購読は connError の effect の中だけ（subscribeConnectivity）で張り、解除と対にする。メンテでは張らない',
    ok: (src) => {
      const c = effectOf(src, CONN_GUARD)
      const m = effectOf(src, MAINT_GUARD)
      if (!c || !m) return false
      return (
        count(src, 'subscribeConnectivity(') === 1 &&
        count(c.body, 'subscribeConnectivity(') === 1 &&
        count(m.body, 'subscribeConnectivity(') === 0 &&
        count(src, 'isOnlineNow(') === count(c.body, 'isOnlineNow(') &&
        pairedInBody(c.body, 'subscribeConnectivity(', (n) => `${n}()`)
      )
    },
    broken: (src) => mutateEffect(src, CONN_GUARD, (b) => b.replace('unsubNet()', '')),
  },
  {
    name: "AppState は isForegroundAppState で判定する（'inactive' では止めない＝素の文字列比較をしない）",
    ok: (src) => {
      const c = effectOf(src, CONN_GUARD)
      const m = effectOf(src, MAINT_GUARD)
      if (!c || !m) return false
      const noLiteral = (b: string) => !/'(active|inactive|background)'/.test(b)
      return (
        count(c.body, 'isForegroundAppState(') === 2 &&
        count(m.body, 'isForegroundAppState(') === 2 &&
        noLiteral(c.body) &&
        noLiteral(m.body)
      )
    },
    broken: (src) => mutateEffect(src, CONN_GUARD, (b) => b.replace('!isForegroundAppState(s)', "s !== 'active'")),
  },
  {
    name: "やり直しは待ち中の重複イベントで回数を戻さない（'resume' の2か所とも isRunning で守る）",
    ok: (src) => {
      const e = effectOf(src, CONN_GUARD)
      return (
        !!e &&
        count(e.body, "r.start('enter')") === 1 &&
        count(e.body, "r.start('resume')") === 2 &&
        e.body.includes("else if (!r.isRunning()) r.start('resume')") &&
        e.body.includes("if (!wasOnline && on && r.isRunning()) r.start('resume')")
      )
    },
    broken: (src) =>
      mutateEffect(src, CONN_GUARD, (b) => b.replace("else if (!r.isRunning()) r.start('resume')", "else r.start('resume')")),
  },
  {
    name: 'maintenance の effect は入った時刻を effect の中に持ち、maintenanceReprobeDelayMs で待つ（回数は持たない）',
    ok: (src) => {
      const e = effectOf(src, MAINT_GUARD)
      return (
        !!e &&
        e.body.includes('const enteredAt = Date.now()') &&
        e.body.includes('maintenanceReprobeDelayMs(new Date(), enteredAt, Math.random())') &&
        !e.body.includes('createConnErrorReprobe(')
      )
    },
    broken: (src) =>
      mutateEffect(src, MAINT_GUARD, (b) =>
        b.replace('maintenanceReprobeDelayMs(new Date(), enteredAt, Math.random())', 'connErrorReprobeDelayMs(0, Math.random())'),
      ),
  },
  {
    name: '開発ログ wait／probe／stop を両方の effect で出す（§8-4 の判定は stop の行で行う）',
    ok: (src) => {
      const c = effectOf(src, CONN_GUARD)
      const m = effectOf(src, MAINT_GUARD)
      return (
        !!c &&
        !!m &&
        c.body.includes('onEvent: reprobeDevLog') &&
        m.body.includes("reprobeDevLog('wait', ms)") &&
        m.body.includes("reprobeDevLog('probe', 0)") &&
        m.body.includes("reprobeDevLog('stop', 0)") &&
        /function reprobeDevLog\(event: ReprobeEvent, ms: number\) \{\n  if \(!__DEV__\) return\n/.test(src)
      )
    },
    broken: (src) => mutateEffect(src, MAINT_GUARD, (b) => b.replace("reprobeDevLog('stop', 0)", '')),
  },
]

describe('🔴 起動ゲートの自動 probe は「いつ撃つか」だけを変え、状態機械と購読の置き場を変えない', () => {
  for (const rule of RULES) {
    it(rule.name, () => {
      expect(rule.ok(SRC)).toBe(true)
    })
  }
})

describe('陰性対照: 各ルールはソースを1か所壊すと落ちる（ラチェットの空振り検出）', () => {
  for (const rule of RULES) {
    it(rule.name, () => {
      expect(rule.ok(rule.broken(SRC))).toBe(false)
    })
  }
})
