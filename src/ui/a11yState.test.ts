import { describe, it, expect } from 'vitest'
import {
  createFlagCache,
  disclosureA11y,
  disclosureActionToggles,
  DISCLOSURE_VALUE_TEXT,
  joinA11yLabel,
  mergeA11yActions,
  findExtraAction,
  type A11yExtraAction,
} from './a11yState'

describe('createFlagCache', () => {
  it('陰性: 初期状態は null（まだ OS 設定が分からない）', () => {
    expect(createFlagCache().get()).toBeNull()
  })
  it('陽性: set した値を get で返し、2つのキャッシュは互いに独立', () => {
    const a = createFlagCache()
    const b = createFlagCache()
    a.set(true)
    expect(a.get()).toBe(true)
    expect(b.get()).toBeNull()
    b.set(false)
    expect(a.get()).toBe(true)
    expect(b.get()).toBe(false)
  })
})

describe('disclosureA11y', () => {
  it('陽性: iOS は値の文字で伝える（開＝展開中・閉＝折りたたみ中）', () => {
    expect(disclosureA11y('ios', true)).toStrictEqual({ role: 'button', valueText: '展開中' })
    expect(disclosureA11y('ios', false)).toStrictEqual({ role: 'button', valueText: '折りたたみ中' })
  })
  it('陰性: iOS の戻り値に expanded も操作も無い（RN の英語 "expanded" を読ませない＝F23）', () => {
    for (const open of [true, false]) {
      const d = disclosureA11y('ios', open)
      expect('expanded' in d).toBe(false)
      expect('action' in d).toBe(false)
    }
  })
  it('陽性: Android は expanded と今の状態に合う操作1つ（開→collapse・閉→expand＝F24）', () => {
    expect(disclosureA11y('android', true)).toStrictEqual({ role: 'button', expanded: true, action: 'collapse' })
    expect(disclosureA11y('android', false)).toStrictEqual({ role: 'button', expanded: false, action: 'expand' })
  })
  it('陰性: Android の戻り値に値の文字が無い（TalkBack の読みと二重にしない＝Q9）', () => {
    for (const open of [true, false]) {
      expect('valueText' in disclosureA11y('android', open)).toBe(false)
    }
  })
  it('語は承認済みの2語だけ（§9-2）', () => {
    expect(DISCLOSURE_VALUE_TEXT).toStrictEqual({ open: '展開中', closed: '折りたたみ中' })
  })
})

describe('disclosureActionToggles', () => {
  it('陽性: 閉じている時の expand と、開いている時の collapse だけ切り替える', () => {
    expect(disclosureActionToggles('expand', false)).toBe(true)
    expect(disclosureActionToggles('collapse', true)).toBe(true)
  })
  it('陰性: 状態に合わない操作・activate・未知の名前では切り替えない', () => {
    expect(disclosureActionToggles('expand', true)).toBe(false)
    expect(disclosureActionToggles('collapse', false)).toBe(false)
    expect(disclosureActionToggles('activate', true)).toBe(false)
    expect(disclosureActionToggles('activate', false)).toBe(false)
    expect(disclosureActionToggles('addEvent', false)).toBe(false)
    expect(disclosureActionToggles('', true)).toBe(false)
  })
})

describe('joinA11yLabel', () => {
  it('陽性: 部分を「、」でつなぐ（A3 の既定・A4 の要対応）', () => {
    expect(joinA11yLabel('各回の予定', '3件')).toBe('各回の予定、3件')
    expect(joinA11yLabel('各回の予定', '直近: 9/14 休講', '要対応')).toBe('各回の予定、直近: 9/14 休講、要対応')
  })
  it('陰性: 空・null・undefined・false は落とし、末尾や途中に「、」を残さない', () => {
    expect(joinA11yLabel('表示', undefined)).toBe('表示')
    expect(joinA11yLabel('出欠', '', null, false)).toBe('出欠')
    expect(joinA11yLabel('各回の予定', undefined, '要対応')).toBe('各回の予定、要対応')
  })
})

describe('mergeA11yActions / findExtraAction', () => {
  const onAction = () => undefined
  const extras: A11yExtraAction[] = [{ name: 'addEvent', label: '予定を追加', onAction }]
  it('陽性: 開閉の操作を先頭のまま1つ残し、追加操作を後ろへ足す（onAction は RN へ渡さない）', () => {
    expect(mergeA11yActions([{ name: 'expand' }], extras)).toStrictEqual([
      { name: 'expand' },
      { name: 'addEvent', label: '予定を追加' },
    ])
  })
  it('iOS（開閉の操作なし）では追加操作だけ／追加が無ければ開閉の操作だけ', () => {
    expect(mergeA11yActions([], extras)).toStrictEqual([{ name: 'addEvent', label: '予定を追加' }])
    expect(mergeA11yActions([{ name: 'collapse' }], [])).toStrictEqual([{ name: 'collapse' }])
  })
  it('陽性: 受けた名前に一致する追加操作を返す／陰性: 開閉の名前・activate・未知の名前では null', () => {
    expect(findExtraAction('addEvent', extras)?.label).toBe('予定を追加')
    expect(findExtraAction('expand', extras)).toBeNull()
    expect(findExtraAction('activate', extras)).toBeNull()
    expect(findExtraAction('hide', extras)).toBeNull()
  })
})
