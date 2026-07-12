import { describe, it, expect } from 'vitest'
import { createWriteQueue } from './writeQueue'

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createWriteQueue', () => {
  it('タスクを実行して結果を返す', async () => {
    const enqueue = createWriteQueue()
    const result = await enqueue(async () => 42)
    expect(result).toBe(42)
  })

  it('タスクは重ならずFIFO順に全件実行される', async () => {
    const enqueue = createWriteQueue()
    const gates = [deferred(), deferred(), deferred()]
    const order: string[] = []
    let active = 0
    let maxActive = 0

    const make = (i: number) => async () => {
      active++
      maxActive = Math.max(maxActive, active)
      order.push(`start${i}`)
      await gates[i].promise
      order.push(`end${i}`)
      active--
      return i
    }
    const p0 = enqueue(make(0))
    const p1 = enqueue(make(1))
    const p2 = enqueue(make(2))

    // 逆順に解放しても実行はFIFO
    gates[2].resolve()
    gates[1].resolve()
    gates[0].resolve()
    const results = await Promise.all([p0, p1, p2])

    expect(results).toEqual([0, 1, 2])
    expect(maxActive).toBe(1)
    expect(order).toEqual(['start0', 'end0', 'start1', 'end1', 'start2', 'end2'])
  })

  it('失敗はそのタスクの呼び出し元へ伝播し、後続タスクは実行される', async () => {
    const enqueue = createWriteQueue()
    const p1 = enqueue(async () => {
      throw new Error('boom')
    })
    const p2 = enqueue(async () => 'ok')
    await expect(p1).rejects.toThrow('boom')
    await expect(p2).resolves.toBe('ok')
  })
})
