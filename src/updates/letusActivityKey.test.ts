import { describe, expect, it } from 'vitest'
import { isSameTrackedActivity, letusActivityKey } from './letusActivityKey'

describe('letusActivityKey', () => {
  it('mod種別＋idで同定（クエリ順・追加パラメータの揺らぎを無視）', () => {
    const a = 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=12345'
    const b = 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=12345&forceview=1'
    expect(letusActivityKey(a)).toBe('assign:12345')
    expect(letusActivityKey(a)).toBe(letusActivityKey(b))
  })
  it('種別が違えば別キー（同idでも assign と resource は別物）', () => {
    expect(letusActivityKey('https://x/mod/assign/view.php?id=7')).not.toBe(
      letusActivityKey('https://x/mod/resource/view.php?id=7'),
    )
  })
  it('mod/id が無いURLはクエリ/ハッシュを落として正規化', () => {
    expect(letusActivityKey('https://letus.ed.tus.ac.jp/my/?x=1#top')).toBe('https://letus.ed.tus.ac.jp/my/')
  })
  it('isSameTrackedActivity: 追跡集合に同一アクティビティがあれば true', () => {
    const tracked = ['https://letus.ed.tus.ac.jp/mod/assign/view.php?id=999']
    expect(isSameTrackedActivity('https://letus.ed.tus.ac.jp/mod/assign/view.php?id=999&x=1', tracked)).toBe(true)
    expect(isSameTrackedActivity('https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1000', tracked)).toBe(false)
  })
})
