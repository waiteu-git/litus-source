import { describe, it, expect } from 'vitest'
import { serializeRuns } from './serializeRuns'

/** 手動resolveできるPromiseと、その完了を制御するハンドルを返す。 */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('serializeRuns', () => {
  it('アイドル時の呼び出しは即座に実行され、完了を待てる', async () => {
    let runs = 0
    const wrapped = serializeRuns(async () => {
      runs++
    })
    await wrapped()
    expect(runs).toBe(1)
  })

  it('実行中の呼び出しは重ならず、前の完了を待ってから追走する', async () => {
    const gates = [deferred(), deferred()]
    let started = 0
    let active = 0
    let maxActive = 0
    const wrapped = serializeRuns(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      const gate = gates[started]
      started++
      await gate.promise
      active--
    })

    const first = wrapped()
    const second = wrapped()
    await Promise.resolve()
    // 1本目が走っている間、2本目は開始されない
    expect(started).toBe(1)

    gates[0].resolve()
    await first
    // 1本目の完了後に2本目が開始される
    gates[1].resolve()
    await second
    expect(started).toBe(2)
    expect(maxActive).toBe(1)
  })

  it('実行中に重なった複数の要求は1回の追走に合流する', async () => {
    const gates = [deferred(), deferred()]
    let started = 0
    const wrapped = serializeRuns(async () => {
      const gate = gates[started]
      started++
      await gate.promise
    })

    const first = wrapped()
    const a = wrapped()
    const b = wrapped()
    const c = wrapped()

    gates[0].resolve()
    await first
    gates[1].resolve()
    await Promise.all([a, b, c])
    // 追走は1回だけ（合計2回）。3要求それぞれが追走を起こさない
    expect(started).toBe(2)
  })

  it('失敗は呼び出し元へ伝播し、以後の呼び出しは正常に実行される', async () => {
    let runs = 0
    let fail = true
    const wrapped = serializeRuns(async () => {
      runs++
      if (fail) throw new Error('boom')
    })

    await expect(wrapped()).rejects.toThrow('boom')
    fail = false
    await expect(wrapped()).resolves.toBeUndefined()
    expect(runs).toBe(2)
  })

  it('実行中の失敗があっても、合流した追走は実行される', async () => {
    const gate = deferred()
    let runs = 0
    const wrapped = serializeRuns(async () => {
      runs++
      if (runs === 1) {
        await gate.promise
        throw new Error('boom')
      }
    })

    const first = wrapped()
    const second = wrapped()
    gate.reject(new Error('boom'))
    await expect(first).rejects.toThrow('boom')
    await expect(second).resolves.toBeUndefined()
    expect(runs).toBe(2)
  })

  it('前走完了直後・追走開始前の割り込み呼び出しも追走に合流する（二重実行しない）', async () => {
    const gates = [deferred(), deferred()]
    let started = 0
    let active = 0
    let maxActive = 0
    const wrapped = serializeRuns(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      const gate = gates[started]
      started++
      await gate.promise
      active--
    })

    const first = wrapped()
    const second = wrapped() // 追走を予約
    gates[0].resolve()
    await first
    // この時点で追走はまだ開始されていないことがある（マイクロタスクの隙間）。
    // ここで割り込んでも新規実行せず、予約済みの追走へ合流すること。
    const third = wrapped()
    gates[1].resolve()
    await Promise.all([second, third])
    expect(started).toBe(2)
    expect(maxActive).toBe(1)
  })
})
