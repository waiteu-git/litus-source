import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONN_REPROBE_BASE_MS,
  CONN_REPROBE_MAX_MS,
  MAINTENANCE_REPROBE_MS,
  connErrorReprobeDelayMs,
  createConnErrorReprobe,
  isForegroundAppState,
  maintenanceReprobeDelayMs,
  type ReprobeEvent,
} from './gateReprobe'

/**
 * 起動ゲートの自動 probe の予定（設計 docs/design/2026-09-12-v11-train1-G1.md §7）。
 * 🔴 守るもの＝G1 が撃つ自動 probe 同士は15秒以上空く（変更前の固定間隔より頻繁にならない）。
 */

// ローカル時刻で組む（maintenanceWindow.test.ts と同じ流儀。判定は getHours/getMinutes）。
const at = (h: number, m = 0, s = 0) => new Date(2026, 8, 14, h, m, s, 0)

describe('connErrorReprobeDelayMs', () => {
  it('rand=0.5（ジッタ係数1.0）なら a=0..6 が 15・30・60・120・240・300・300秒', () => {
    const series = [0, 1, 2, 3, 4, 5, 6].map((a) => connErrorReprobeDelayMs(a, 0.5))
    expect(series).toEqual([15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000])
  })

  it('陰性: rand=0 でも a=0 が15秒を割らない（-20% の 12秒は下限で15秒に戻す）', () => {
    expect(connErrorReprobeDelayMs(0, 0)).toBe(CONN_REPROBE_BASE_MS)
  })

  it('陰性: a=1000・負数・NaN、rand=NaN でも NaN／Infinity にならず、15秒〜5分に収まる', () => {
    for (const a of [1000, 1e9, Infinity, -1, -1000, NaN]) {
      for (const rand of [0, 0.5, 0.999999, NaN]) {
        const d = connErrorReprobeDelayMs(a, rand)
        expect(Number.isFinite(d)).toBe(true)
        expect(d).toBeGreaterThanOrEqual(CONN_REPROBE_BASE_MS)
        expect(d).toBeLessThanOrEqual(CONN_REPROBE_MAX_MS)
      }
    }
    expect(connErrorReprobeDelayMs(-1, 0.5)).toBe(15_000) // 負数は a=0 とみなす
    expect(connErrorReprobeDelayMs(NaN, 0.5)).toBe(15_000) // 非数も a=0
    expect(connErrorReprobeDelayMs(0, NaN)).toBe(15_000) // rand の非数はジッタ無し
  })

  it('a×rand の格子の全域で15秒〜300秒に収まる', () => {
    for (let a = 0; a <= 12; a++) {
      for (let i = 0; i < 100; i++) {
        const d = connErrorReprobeDelayMs(a, i / 100)
        expect(d).toBeGreaterThanOrEqual(CONN_REPROBE_BASE_MS)
        expect(d).toBeLessThanOrEqual(CONN_REPROBE_MAX_MS)
      }
    }
  })
})

describe('maintenanceReprobeDelayMs', () => {
  it('帯の中: 2:00 で rand=0→ちょうど2時間、rand=0.5→2時間30秒', () => {
    const now = at(2, 0)
    expect(maintenanceReprobeDelayMs(now, now.getTime(), 0)).toBe(7_200_000)
    expect(maintenanceReprobeDelayMs(now, now.getTime(), 0.5)).toBe(7_230_000)
  })

  it('帯の中: 3:59:30 → 30秒＋ぶれ（0〜60秒）', () => {
    const now = at(3, 59, 30)
    expect(maintenanceReprobeDelayMs(now, now.getTime(), 0)).toBe(30_000)
    expect(maintenanceReprobeDelayMs(now, now.getTime(), 0.5)).toBe(60_000)
    expect(maintenanceReprobeDelayMs(now, now.getTime(), 0.999999)).toBe(89_999)
  })

  it('陰性: 帯の外（4:00・1:59・12:00）は、入った時刻＝今なら60秒（変更前と同じ）', () => {
    for (const now of [at(4, 0), at(1, 59), at(12, 0)]) {
      expect(maintenanceReprobeDelayMs(now, now.getTime(), 0.5)).toBe(MAINTENANCE_REPROBE_MS)
    }
  })

  it('陰性: 帯の中では入った時刻を見ない', () => {
    const now = at(2, 30)
    const a = maintenanceReprobeDelayMs(now, now.getTime(), 0.5)
    const b = maintenanceReprobeDelayMs(now, now.getTime() - 20 * 60_000, 0.5)
    expect(a).toBe(b)
    expect(a).toBe(90 * 60_000 + 30_000)
  })

  it('陰性: 帯の外は入った時刻からの残り。負にならず、時計が戻っても60秒を超えない', () => {
    const now = at(12, 0)
    expect(maintenanceReprobeDelayMs(now, now.getTime() - 45_000, 0.5)).toBe(15_000)
    expect(maintenanceReprobeDelayMs(now, now.getTime() - 90_000, 0.5)).toBe(0)
    expect(maintenanceReprobeDelayMs(now, now.getTime() + 3_600_000, 0.5)).toBe(MAINTENANCE_REPROBE_MS)
  })
})

describe('isForegroundAppState', () => {
  it("'active'・'inactive'・'unknown'・null・undefined は true（fail-open・'inactive' では止めない）", () => {
    for (const s of ['active', 'inactive', 'unknown', null, undefined]) {
      expect(isForegroundAppState(s)).toBe(true)
    }
  })
  it("陰性: 'background' は false", () => {
    expect(isForegroundAppState('background')).toBe(false)
  })
})

describe('createConnErrorReprobe（fake timers）', () => {
  const T0 = at(12, 0).getTime()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** onProbe が呼ばれた時刻（T0 からの秒）を記録する予定表を作る。 */
  function recorder(random: () => number = () => 0.5) {
    const probes: number[] = []
    const events: [ReprobeEvent, number][] = []
    const r = createConnErrorReprobe(() => probes.push((Date.now() - T0) / 1000), {
      random,
      onEvent: (e, ms) => events.push([e, ms]),
    })
    return { r, probes, events }
  }

  it("連鎖: start('enter')・rand=0.5 で、1時間の probe は 15・45・105・225・465・765秒…の計15回", () => {
    const { r, probes } = recorder()
    r.start('enter')
    vi.advanceTimersByTime(3_600_000)
    expect(probes).toEqual([
      15, 45, 105, 225, 465, 765, 1065, 1365, 1665, 1965, 2265, 2565, 2865, 3165, 3465,
    ])
  })

  it('陰性: stop() の後は1回も撃たない', () => {
    const { r, probes } = recorder()
    r.start('enter')
    vi.advanceTimersByTime(10_000)
    r.stop()
    vi.advanceTimersByTime(3_600_000)
    expect(probes).toEqual([])
    expect(r.isRunning()).toBe(false)
  })

  it("陰性: start の呼び出しの中で同期に撃たない（待ちが0の 'resume' でも setTimeout を通す）", () => {
    const { r, probes } = recorder()
    vi.advanceTimersByTime(60_000) // 直近（作った時刻）から60秒＝待ちは0になる
    r.start('resume')
    expect(probes).toEqual([])
    vi.advanceTimersByTime(0)
    expect(probes).toEqual([60])
  })

  it("やり直し: 直近の probe から20秒後の start('resume') は即1回撃ち、その次は15秒後（delay(0)）", () => {
    const { r, probes } = recorder()
    r.start('enter')
    vi.advanceTimersByTime(15_000) // 1回目＝15秒
    vi.advanceTimersByTime(20_000) // 35秒（連鎖どおりなら次は45秒）
    r.start('resume')
    vi.advanceTimersByTime(0)
    expect(probes).toEqual([15, 35])
    vi.advanceTimersByTime(15_000)
    expect(probes).toEqual([15, 35, 50]) // delay(0)=15秒
    vi.advanceTimersByTime(30_000)
    expect(probes).toEqual([15, 35, 50, 80]) // delay(1)=30秒へ伸びていく
  })

  it("陰性: 直近から5秒後の start('resume') は即撃たず、直近＋15秒で撃つ", () => {
    const { r, probes } = recorder()
    r.start('enter')
    vi.advanceTimersByTime(15_000) // 1回目＝15秒
    vi.advanceTimersByTime(5_000) // 20秒
    r.start('resume')
    vi.advanceTimersByTime(9_999)
    expect(probes).toEqual([15])
    vi.advanceTimersByTime(1)
    expect(probes).toEqual([15, 30]) // 直近15秒＋15秒
    vi.advanceTimersByTime(15_000)
    expect(probes).toEqual([15, 30, 45])
  })

  it('対照: やり直さない連鎖では2回目の間隔が24〜36秒（＝バックオフが効いている）', () => {
    for (const rand of [0, 0.5, 0.999999]) {
      vi.setSystemTime(T0)
      const { r, probes } = recorder(() => rand)
      r.start('enter')
      vi.advanceTimersByTime(60_000)
      expect(probes.length).toBeGreaterThanOrEqual(2)
      const gap = (probes[1] - probes[0]) * 1000
      expect(gap).toBeGreaterThanOrEqual(24_000)
      expect(gap).toBeLessThanOrEqual(36_000)
      r.stop()
    }
  })

  it('isRunning: 張る前は false、張ったら true、撃った後も連鎖が続く間は true、stop で false', () => {
    const { r } = recorder()
    expect(r.isRunning()).toBe(false)
    r.start('enter')
    expect(r.isRunning()).toBe(true)
    vi.advanceTimersByTime(15_000)
    expect(r.isRunning()).toBe(true)
    r.stop()
    expect(r.isRunning()).toBe(false)
  })

  it('onEvent: wait（待ちのms）→ probe → wait → stop の順に届く。待ちが無い時の stop は届かない', () => {
    const { r, events } = recorder()
    r.stop() // 待ちが無い＝何も起きない
    r.start('enter')
    vi.advanceTimersByTime(15_000)
    r.stop()
    r.stop() // 2回目は待ちが無い
    expect(events).toEqual([
      ['wait', 15_000],
      ['probe', 0],
      ['wait', 30_000],
      ['stop', 0],
    ])
  })

  it('onProbe の中で stop() されたら、次の待ちを張らない（止めた予定表が生き返らない）', () => {
    let n = 0
    const r = createConnErrorReprobe(
      () => {
        n += 1
        r.stop()
      },
      { random: () => 0.5 },
    )
    r.start('enter')
    vi.advanceTimersByTime(3_600_000)
    expect(n).toBe(1)
    expect(r.isRunning()).toBe(false)
  })

  it("端末の時計が戻っても、'resume' の待ちは15秒を超えない（間隔は必ず15秒〜5分）", () => {
    const { r, probes } = recorder()
    r.start('enter')
    vi.advanceTimersByTime(15_000) // 1回目
    r.stop()
    vi.setSystemTime(Date.now() - 3_600_000) // 時計が1時間戻った
    r.start('resume')
    vi.advanceTimersByTime(15_000)
    expect(probes.length).toBe(2)
  })

  /** 種を固定した擬似乱数（mulberry32）。性質テストを決定的にする。 */
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it("🔴 不変条件: stop と start('resume') を任意の時刻に1000回混ぜても、連続する probe の間隔は全て15秒以上", () => {
    const ops = mulberry32(20260912)
    const probeAt: number[] = []
    const r = createConnErrorReprobe(() => probeAt.push(Date.now()), { random: mulberry32(7) })
    r.start('enter')
    let resumesUnderFloor = 0
    for (let i = 0; i < 1000; i++) {
      // 3割は1秒おきの連打、残りは0〜120秒の任意の間隔。
      vi.advanceTimersByTime(ops() < 0.3 ? 1_000 : Math.floor(ops() * 120_000))
      if (ops() < 0.5) {
        r.stop()
      } else {
        const last = probeAt.length > 0 ? probeAt[probeAt.length - 1] : T0
        if (Date.now() - last < CONN_REPROBE_BASE_MS) resumesUnderFloor += 1
        r.start('resume')
      }
    }
    vi.advanceTimersByTime(CONN_REPROBE_MAX_MS)
    // 空振りの対照①: 床が実際に働く場面（直近から15秒以内のやり直し）が操作列に含まれていること。
    expect(resumesUnderFloor).toBeGreaterThan(0)
    // 空振りの対照②: probe が十分に撃たれていること（1回も撃たない実装でも間隔の性質は満たせてしまう）。
    expect(probeAt.length).toBeGreaterThan(100)
    expect(probeAt[0] - T0).toBeGreaterThanOrEqual(CONN_REPROBE_BASE_MS) // 最初の1回も入った時刻から15秒以上
    const gaps = probeAt.slice(1).map((t, i) => t - probeAt[i])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(CONN_REPROBE_BASE_MS)
  })
})
