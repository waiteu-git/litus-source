import { describe, expect, it } from 'vitest'
import { classifyCollectionHealth, type HealthSignals } from './collectionHealth'

/** 全フィールドを「何も観測していない」既定値で埋め、ケースごとに上書きする。 */
function sig(over: Partial<HealthSignals>): HealthSignals {
  return {
    containerPresent: false,
    rawItemCount: 0,
    parsedItemCount: 0,
    maintenanceSeen: false,
    conflictSeen: false,
    passwordSeen: false,
    loggedIn: false,
    offTarget: false,
    bodyLength: 0,
    ...over,
  }
}

describe('classifyCollectionHealth', () => {
  it('パース成功が1件以上あれば ok（件数つき）', () => {
    expect(classifyCollectionHealth(sig({ containerPresent: true, rawItemCount: 143, parsedItemCount: 143 })))
      .toEqual({ status: 'ok', count: 143 })
  })

  it('行はDOMに在るのに1件も解析できない＝内部構造ドリフト', () => {
    expect(classifyCollectionHealth(sig({ containerPresent: true, rawItemCount: 143, parsedItemCount: 0, loggedIn: true })))
      .toEqual({ status: 'structure_drift' })
  })

  it('コンテナは在るが行0＝本当に0件（empty_valid）', () => {
    expect(classifyCollectionHealth(sig({ containerPresent: true, rawItemCount: 0, loggedIn: true })))
      .toEqual({ status: 'empty_valid' })
  })

  it('メンテナンス観測はコンテナ不在なら maintenance', () => {
    expect(classifyCollectionHealth(sig({ maintenanceSeen: true }))).toEqual({ status: 'maintenance' })
  })

  it('PC競合(conflict)は一時的 blocked', () => {
    expect(classifyCollectionHealth(sig({ conflictSeen: true, loggedIn: true, bodyLength: 900 })))
      .toEqual({ status: 'blocked' })
  })

  it('ログイン画面を見たままログイン痕跡なし → not_logged_in', () => {
    expect(classifyCollectionHealth(sig({ passwordSeen: true, bodyLength: 900 })))
      .toEqual({ status: 'not_logged_in' })
  })

  it('ログイン画面を経由しても最終的にログイン済みなら not_logged_in にしない（自動リダイレクト）', () => {
    expect(classifyCollectionHealth(sig({ passwordSeen: true, loggedIn: true, bodyLength: 900 })))
      .toEqual({ status: 'structure_drift' }) // ログイン済＋実質ページ＋コンテナ不在
  })

  it('目的ページ以外（ポータル等）に留まった＝ナビ失敗は blocked', () => {
    expect(classifyCollectionHealth(sig({ offTarget: true, loggedIn: true, bodyLength: 900 })))
      .toEqual({ status: 'blocked' })
  })

  it('ログイン済・実質ページ描画済・なのにコンテナ不在 → structure_drift', () => {
    expect(classifyCollectionHealth(sig({ loggedIn: true, bodyLength: 900 })))
      .toEqual({ status: 'structure_drift' })
  })

  it('本文が短すぎる（空白/エラー断片）は drift 判定せず blocked', () => {
    expect(classifyCollectionHealth(sig({ loggedIn: true, bodyLength: 50 })))
      .toEqual({ status: 'blocked' })
  })

  it('何も観測できなかった（タイムアウト等）は blocked', () => {
    expect(classifyCollectionHealth(sig({}))).toEqual({ status: 'blocked' })
  })

  it('パース成功はメンテ観測より優先（収集できたなら ok）', () => {
    expect(classifyCollectionHealth(sig({ containerPresent: true, rawItemCount: 5, parsedItemCount: 5, maintenanceSeen: true })))
      .toEqual({ status: 'ok', count: 5 })
  })
})
