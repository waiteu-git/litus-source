import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { isBulletinActionBlocked } from './bulletinActionGate'
import { evaluateAccess } from '../health/accessGate'
import { parseKillSwitchStatus, type KillSwitchStatus } from '../health/killSwitch'

/**
 * 掲示アクション（詳細を開く・一覧の「既読にする」・ブックマーク）を止めるかの判定。
 * 設計: docs/design/2026-09-12-v11-train1-KS.md §7
 *
 * vitest は node 環境で純粋層しか読めない（BulletinActionEngine は RN を引き込む）ので、
 * 判定を純関数に出してここで固定し、配線はソースを読むラチェット（R1〜R6）で固定する。
 */

// ローカル時刻で h:m の Date を作る（maintenanceWindow は getHours/getMinutes 判定＝TZ 非依存）。
const at = (h: number, m = 0) => new Date(2026, 8, 14, h, m, 0)
const OK = evaluateAccess('class', { now: at(12), isOnline: true })
const OFFLINE = evaluateAccess('class', { now: at(12), isOnline: false })
const MAINTENANCE = evaluateAccess('class', { now: at(3), isOnline: true })

function status(over: Partial<KillSwitchStatus> = {}): KillSwitchStatus {
  return { disabledAll: false, disabled: [], message: null, title: null, calendar: null, ...over }
}

describe('isBulletinActionBlocked', () => {
  it('前提: 対照に使うアクセス判定3種が想定どおり（ここが崩れると T1〜T7 が別物を見る）', () => {
    expect(OK).toEqual({ allowed: true, reason: 'ok' })
    expect(OFFLINE).toEqual({ allowed: false, reason: 'offline' })
    expect(MAINTENANCE).toEqual({ allowed: false, reason: 'maintenance' })
  })

  it('T1 停止状態が未取得（null）なら止めない＝fail-open（新規インストール・更新直後）', () => {
    expect(isBulletinActionBlocked(OK, null)).toBe(false)
  })

  it('T2 お知らせ帯だけ（disabled 空＋message あり）では止めない', () => {
    expect(isBulletinActionBlocked(OK, status({ message: 'お知らせ' }))).toBe(false)
  })

  it('T3 他の機能キー（attendance・letus）では止めない', () => {
    expect(isBulletinActionBlocked(OK, status({ disabled: ['attendance', 'letus'] }))).toBe(false)
  })

  it('T4 bulletin の停止で止める', () => {
    expect(isBulletinActionBlocked(OK, status({ disabled: ['bulletin'] }))).toBe(true)
  })

  it('T5 all（disabledAll）でも止める（停止画面の作りが変わっても掲示アクションは止まったまま）', () => {
    expect(isBulletinActionBlocked(OK, status({ disabledAll: true }))).toBe(true)
  })

  it('T6 オフラインは従来どおり止める', () => {
    expect(isBulletinActionBlocked(OFFLINE, null)).toBe(true)
  })

  it('T7 CLASS のメンテ帯は従来どおり止める', () => {
    expect(isBulletinActionBlocked(MAINTENANCE, null)).toBe(true)
  })
})

/**
 * 設計 §8.2 で人間が本番の status.json に置くもの（現行の status.json＋versionRules 1ブロック）と同じ形。
 * N_KS はテスト内の定数（実際の番号はリリース時に決まる。ルールと番号の両方をこのテストが持つので版上げで腐らない）。
 */
const N_KS = 216
const STATUS_JSON_WITH_KS_RULE = JSON.stringify({
  schemaVersion: 1,
  disabled: [],
  message: '',
  calendar: {
    terms: [
      { id: '2026-spring', start: '2026-04-13', end: '2026-08-06' },
      { id: '2026-fall', start: '2026-09-11', end: '2027-01-25' },
    ],
  },
  versionRules: [{ disabled: ['bulletin'], minBuild: N_KS, maxBuild: N_KS }],
})

describe('§8.2 で本番に置く versionRules（N_KS だけを止める）', () => {
  it('T8 N_KS のビルドでは止まる（calendar を残した形であることも確かめる）', () => {
    const s = parseKillSwitchStatus(STATUS_JSON_WITH_KS_RULE, N_KS)
    expect(s).not.toBeNull()
    expect(s?.disabled).toEqual(['bulletin'])
    expect(s?.calendar).not.toBeNull()
    expect(isBulletinActionBlocked(OK, s)).toBe(true)
  })

  it('T9 N_KS−1 と N_KS+1 のビルドには当たらない（版の狙い撃ち）', () => {
    for (const build of [N_KS - 1, N_KS + 1]) {
      const s = parseKillSwitchStatus(STATUS_JSON_WITH_KS_RULE, build)
      // 陰性対照が「パース失敗→null→許可」で偽の緑にならないよう、解決できたことを先に確かめる。
      expect(s).not.toBeNull()
      expect(s?.disabled).toEqual([])
      expect(isBulletinActionBlocked(OK, s)).toBe(false)
    }
  })

  it('T10 ビルド番号が取れない（null＝dev 等）ならルールを適用しない', () => {
    const s = parseKillSwitchStatus(STATUS_JSON_WITH_KS_RULE, null)
    expect(s).not.toBeNull()
    expect(s?.disabled).toEqual([])
    expect(isBulletinActionBlocked(OK, s)).toBe(false)
  })
})

/**
 * ラチェット（設計 §7.2）。BulletinActionEngine と掲示の画面は React/RN を引き込むため vitest から読めない。
 * 配線の要点をソースの文字列で固定する（notificationSuppress.test.ts の「解除の検知の配線」と同型）。
 * どれも一時的に壊すと落ちることを確かめてある（設計 §7.3＝落ちないラチェットは計器として働かない）。
 */
const SRC = join(__dirname, '..')
const ROOT = join(SRC, '..')
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8')

/** `callee(` の直後から、対応する `)` までの引数の文字列（入れ子の括弧を数える）。呼び出しが無ければ null。 */
function callArgs(src: string, callee: string): string | null {
  const open = src.indexOf(`${callee}(`)
  if (open < 0) return null
  const from = open + callee.length
  let depth = 0
  for (let i = from; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return src.slice(from + 1, i)
  }
  return null
}

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listSources(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/** needle を含む非テストのソース（src/ からの相対パス＋エントリポイント）。定義元の injectedScripts.ts は除く。 */
function filesUsing(needle: string): string[] {
  const hits: string[] = []
  for (const file of listSources(SRC)) {
    const rel = relative(SRC, file).split(sep).join('/')
    if (rel === 'collect/injectedScripts.ts') continue
    if (readFileSync(file, 'utf8').includes(needle)) hits.push(rel)
  }
  for (const name of ['App.tsx', 'index.ts']) {
    const p = join(ROOT, name)
    if (existsSync(p) && readFileSync(p, 'utf8').includes(needle)) hits.push(name)
  }
  return hits.sort()
}

describe('ラチェット: 掲示アクションの停止はエンジン1箇所で効く', () => {
  const engine = read('collect/BulletinActionEngine.tsx')

  it('R1 useKillSwitch() の status が isBulletinActionBlocked の引数に届いている（第2引数に null を書いても型は通るため）', () => {
    expect(engine).toContain('const { status: killStatus } = useKillSwitch()')
    const args = callArgs(engine, 'isBulletinActionBlocked')
    expect(args).not.toBeNull()
    expect(args).toMatch(/\bkillStatus\b/)
  })

  it('R2 blocked の早期 return は最初の <ClassHeadlessCollector より前（openDetail と setFlag の両方に効く）', () => {
    const ret = engine.indexOf('if (blocked) return null')
    const first = engine.indexOf('<ClassHeadlessCollector')
    expect(ret).toBeGreaterThan(-1)
    expect(first).toBeGreaterThan(-1)
    expect(ret).toBeLessThan(first)
  })

  it('R3 停止状態をキャッシュから直接読まない（別ビルドで解決したキャッシュを捨てる Provider のガードを失う）', () => {
    expect(engine).not.toContain('loadKillSwitchCache')
  })

  it('R4 掲示1件に作用する注入 JS の使用元を記号ごとに固定する（B・D が呼び出し元を増やしたらここで落ちる＝エンジン経由を強制）', () => {
    expect(filesUsing('openBulletinDetailJs(')).toEqual([
      'collect/BulletinActionEngine.tsx',
      'screens/BulletinWebScreen.tsx',
    ])
    expect(filesUsing('setBulletinFlagJs(')).toEqual(['collect/BulletinActionEngine.tsx'])
    expect(filesUsing('COLLECT_BULLETIN_DETAIL_JS')).toEqual(['collect/BulletinActionEngine.tsx'])
  })
})

describe('ラチェット: 掲示の画面', () => {
  it('R5 掲示詳細に停止バナーがある（ホームのカルーセルから一覧を経ずに詳細へ来る経路があるため）', () => {
    expect(read('screens/BulletinDetailScreen.tsx')).toContain('<KillSwitchBanner feature="bulletin"')
  })

  it('R6 「元ページで開く」は停止キーを見ない（§9-1 裁定＝停止中も通す。塞ぐ裁定になったら反転する）', () => {
    const web = read('screens/BulletinWebScreen.tsx')
    expect(web).not.toContain('useKillSwitch')
    expect(web).not.toContain('isKilled')
  })
})
