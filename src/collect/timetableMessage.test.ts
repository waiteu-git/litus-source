import { parseCollectionMessage } from './timetableMessage'
import { TABLE_MINIMAL, JIGEN_AREA_NODA } from '../parsers/timetable.fixtures'
import { parse } from 'node-html-parser'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 実DOM回帰: 学生時間割表ページ（2026-07-10実測・電気のみ1テーブル）。実サイトのDOM変更で
// table.classTable / dd.jigenArea が壊れていないこと＝時間割が黙って空にならないことを担保。
describe('parseCollectionMessage（実DOMフィクスチャ）', () => {
  const html = readFileSync(
    fileURLToPath(new URL('../parsers/__fixtures__/timetable-real.html', import.meta.url)),
    'utf-8',
  )
  const root = parse(html)
  const table = root.querySelector('table.classTable')?.outerHTML ?? ''
  const jigen = root.querySelector('dd.jigenArea')?.text ?? ''

  it('実ページの時間割テーブルからコマを抽出できる', () => {
    const r = parseCollectionMessage(JSON.stringify({ type: 'timetable', tables: [table], jigen }))
    expect(r.error).toBeNull()
    expect(r.collections).toHaveLength(1)
    expect(r.collections[0].slots.length).toBeGreaterThan(0)
  })
  it('実ページの時限表（dd.jigenArea）から時限時刻を取れる', () => {
    const r = parseCollectionMessage(JSON.stringify({ type: 'timetable', tables: [table], jigen }))
    expect(r.collections[0].periodTimes?.campus).toBe('野田')
    expect((r.collections[0].periodTimes?.periods.length ?? 0)).toBeGreaterThanOrEqual(5)
  })
})

describe('parseCollectionMessage', () => {
  it('複数テーブル（すべて＝前期＋後期）をそれぞれ構造化する', () => {
    const raw = JSON.stringify({
      type: 'timetable',
      tables: [TABLE_MINIMAL, TABLE_MINIMAL],
      jigen: JIGEN_AREA_NODA,
    })
    const r = parseCollectionMessage(raw)
    expect(r.error).toBeNull()
    expect(r.collections).toHaveLength(2)
    expect(r.collections[0].slots).toHaveLength(2)
    expect(r.collections[1].slots).toHaveLength(2)
    expect(r.collections[0].periodTimes?.campus).toBe('野田')
  })

  it('単一テーブル（tables長さ1）も1コレクションで返す', () => {
    const raw = JSON.stringify({ type: 'timetable', tables: [TABLE_MINIMAL], jigen: JIGEN_AREA_NODA })
    const r = parseCollectionMessage(raw)
    expect(r.error).toBeNull()
    expect(r.collections).toHaveLength(1)
    expect(r.collections[0].slots).toHaveLength(2)
  })

  it('旧形式（table単数）も後方互換で受ける', () => {
    const raw = JSON.stringify({ type: 'timetable', table: TABLE_MINIMAL, jigen: JIGEN_AREA_NODA })
    const r = parseCollectionMessage(raw)
    expect(r.error).toBeNull()
    expect(r.collections).toHaveLength(1)
    expect(r.collections[0].slots).toHaveLength(2)
  })

  it('JSONとして壊れていればエラー・collections空', () => {
    const r = parseCollectionMessage('not-json')
    expect(r.collections).toEqual([])
    expect(r.error).toBe('メッセージを解析できませんでした')
  })

  it('nullや非オブジェクトならクラッシュせず解析エラー', () => {
    for (const raw of ['null', '42', 'true', '"str"']) {
      const r = parseCollectionMessage(raw)
      expect(r.collections).toEqual([])
      expect(r.error).toBe('メッセージを解析できませんでした')
    }
  })

  it('テーブルが1つも無ければエラー', () => {
    const r = parseCollectionMessage(JSON.stringify({ type: 'timetable', tables: [], jigen: '' }))
    expect(r.error).toBe('時間割テーブルが見つかりませんでした')
    const r2 = parseCollectionMessage(JSON.stringify({ type: 'timetable', tables: ['', '  '], jigen: '' }))
    expect(r2.error).toBe('時間割テーブルが見つかりませんでした')
  })

  it('全テーブルに授業が無ければ読み取り失敗エラー', () => {
    const empty = '<table class="classTable"><tr><th class="headerYobi">月曜日</th></tr></table>'
    const r = parseCollectionMessage(JSON.stringify({ type: 'timetable', tables: [empty], jigen: '' }))
    expect(r.collections).toHaveLength(1)
    expect(r.collections[0].slots).toEqual([])
    expect(r.error).toBe('時間割を読み取れませんでした')
  })

  it('jigenが空でもtableが有効ならslotsは返す（periodTimesはnull）', () => {
    const r = parseCollectionMessage(JSON.stringify({ type: 'timetable', tables: [TABLE_MINIMAL], jigen: '' }))
    expect(r.collections[0].slots).toHaveLength(2)
    expect(r.collections[0].periodTimes).toBeNull()
    expect(r.error).toBeNull()
  })
})
