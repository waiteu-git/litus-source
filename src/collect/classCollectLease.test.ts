import { describe, it, expect, beforeEach } from 'vitest'
import {
  acquireClassLease,
  releaseClassLease,
  classLeaseBusy,
  _resetClassLease,
} from './classCollectLease'

describe('classCollectLease', () => {
  beforeEach(() => _resetClassLease())

  it('初回（直前の返却なし）は settle=false で即時取得・保持者になる', async () => {
    const a = {}
    expect(classLeaseBusy()).toBe(false)
    const r = await acquireClassLease(a)
    expect(r.settle).toBe(false)
    expect(classLeaseBusy()).toBe(true)
  })

  it('直近に別収集が返却した直後の即時取得は settle=true（引き継ぎ）', async () => {
    const a = {}
    const b = {}
    await acquireClassLease(a)
    releaseClassLease(a) // 返却直後
    const r = await acquireClassLease(b) // 空きだが直前返却あり
    expect(r.settle).toBe(true)
  })

  it('保持中の別tokenは待たされ、返却で settle=true として引き渡される', async () => {
    const a = {}
    const b = {}
    await acquireClassLease(a)
    let bGranted = false
    const bPromise = acquireClassLease(b).then((r) => {
      bGranted = true
      return r
    })
    await Promise.resolve()
    expect(bGranted).toBe(false) // a保持中は引き渡されない
    releaseClassLease(a)
    const r = await bPromise
    expect(r.settle).toBe(true)
    expect(classLeaseBusy()).toBe(true)
  })

  it('FIFO順で引き渡す（A→B→C）', async () => {
    const a = {}, b = {}, c = {}
    await acquireClassLease(a)
    const order: string[] = []
    acquireClassLease(b).then(() => order.push('b'))
    acquireClassLease(c).then(() => order.push('c'))
    releaseClassLease(a)
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['b'])
    releaseClassLease(b)
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['b', 'c'])
  })

  it('同一tokenの二重取得は冪等（即時）', async () => {
    const a = {}
    await acquireClassLease(a)
    const r2 = await acquireClassLease(a)
    expect(classLeaseBusy()).toBe(true)
    expect(typeof r2.settle).toBe('boolean')
  })

  it('保持者でないtokenの返却は保持者を奪わない（no-op）', async () => {
    const a = {}, b = {}
    await acquireClassLease(a)
    releaseClassLease(b) // aが保持者・bは無関係
    expect(classLeaseBusy()).toBe(true)
    let cGranted = false
    acquireClassLease({}).then(() => (cGranted = true))
    await Promise.resolve()
    expect(cGranted).toBe(false)
  })

  it('取得前に待機列から外れたtokenは掃除され、引き渡し順を乱さない', async () => {
    const a = {}, b = {}, c = {}
    await acquireClassLease(a)
    const order: string[] = []
    acquireClassLease(b).then(() => order.push('b'))
    acquireClassLease(c).then(() => order.push('c'))
    releaseClassLease(b) // bが取得前に離脱（アンマウント等）
    releaseClassLease(a)
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['c'])
  })

  it('全返却で空きに戻る', async () => {
    const a = {}
    await acquireClassLease(a)
    releaseClassLease(a)
    expect(classLeaseBusy()).toBe(false)
  })
})
