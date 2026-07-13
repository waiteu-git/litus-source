import { describe, expect, it } from 'vitest'
import { bulletinEmptyCard } from './bulletinEmptyCard'

describe('bulletinEmptyCard', () => {
  it('未取得: タップで取得を促し、一覧導線は出さない', () => {
    expect(bulletinEmptyCard({ syncing: false, running: false, collected: false })).toEqual({
      text: 'まだ取得できていません。タップで取得します。',
      action: 'sync',
      showAllLink: false,
    })
  })

  it('未取得×授業中: 取得を控えている旨を出す', () => {
    expect(bulletinEmptyCard({ syncing: false, running: true, collected: false })).toEqual({
      text: '授業中は取得を控えています。授業後に取得できます。',
      action: 'sync',
      showAllLink: false,
    })
  })

  it('取得済みで未読0件: 「新着・未読なし」を明示し、一覧（フラグ付き/授業）への導線を残す', () => {
    expect(bulletinEmptyCard({ syncing: false, running: false, collected: true })).toEqual({
      text: '新着・未読の掲示はありません',
      action: 'list',
      showAllLink: true,
    })
  })

  it('取得済みは授業中でも「新着・未読なし」（取得ガードの文言で上書きしない）', () => {
    expect(bulletinEmptyCard({ syncing: false, running: true, collected: true }).text).toBe(
      '新着・未読の掲示はありません',
    )
  })

  it('取得中は取得中テキスト。取得済みなら一覧導線は維持', () => {
    expect(bulletinEmptyCard({ syncing: true, running: false, collected: true })).toEqual({
      text: '掲示を取得しています…',
      action: 'list',
      showAllLink: true,
    })
    expect(bulletinEmptyCard({ syncing: true, running: false, collected: false }).showAllLink).toBe(false)
  })
})
