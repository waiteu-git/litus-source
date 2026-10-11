import { describe, expect, it } from 'vitest'
import { LITUS_SITE_URL, noticeHash, resolveNotice } from './notice'
import type { KillSwitchStatus } from './killSwitch'

const ok = (message: string | null): KillSwitchStatus => ({
  disabledAll: false,
  disabled: [],
  message,
  title: null,
  calendar: null,
})

const NORMAL = { demo: false, dismissedHash: null }

describe('resolveNotice', () => {
  it('message があり・非停止・非デモ・未読なら帯を出す', () => {
    const n = resolveNotice(ok('7/30 2:00-4:00 はメンテナンスです'), NORMAL)
    expect(n?.text).toBe('7/30 2:00-4:00 はメンテナンスです')
  })

  it('message が無い（null）なら出さない', () => {
    expect(resolveNotice(ok(null), NORMAL)).toBeNull()
  })

  it('message が空白のみなら出さない', () => {
    // normText は '' しか弾かない（trimしない）ので、空白潰しはこちらの責務。
    expect(resolveNotice(ok('   '), NORMAL)).toBeNull()
    expect(resolveNotice(ok('\n \t'), NORMAL)).toBeNull()
  })

  it('status 未取得（null）なら出さない', () => {
    expect(resolveNotice(null, NORMAL)).toBeNull()
  })

  it('アプリ全停止中は出さない（停止画面と二重に出さない）', () => {
    const killed: KillSwitchStatus = {
      disabledAll: true, disabled: [], message: '停止中です', title: null, calendar: null,
    }
    expect(resolveNotice(killed, NORMAL)).toBeNull()
  })

  it('デモモード中は出さない（審査員のデモ体験に運用メッセージを混ぜない）', () => {
    // ⚠ 階層（DemoProvider が外側）では防げない: KillSwitchProvider は起動時に実名前空間の
    //    キャッシュを読み込み済みで、デモへ入っても status を持ったままになる。明示的に止める。
    expect(resolveNotice(ok('メンテナンスです'), { demo: true, dismissedHash: null })).toBeNull()
  })

  it('機能別停止のときは帯を出す（その画面に到達できない人にも届ける）', () => {
    const partial: KillSwitchStatus = {
      disabledAll: false,
      disabled: ['attendance'],
      message: '出席機能を一時停止しています',
      title: null,
      calendar: null,
    }
    expect(resolveNotice(partial, NORMAL)?.text).toBe('出席機能を一時停止しています')
  })

  it('既読ハッシュが一致する文面は出さない', () => {
    const text = 'メンテナンスは終了しました'
    const dismissedHash = noticeHash(text)
    expect(resolveNotice(ok(text), { demo: false, dismissedHash })).toBeNull()
  })

  it('文面が変われば既読を無視して再表示する', () => {
    const dismissedHash = noticeHash('古いお知らせ')
    expect(resolveNotice(ok('新しいお知らせ'), { demo: false, dismissedHash })?.text).toBe('新しいお知らせ')
  })

  it('前後の空白は落として表示する', () => {
    expect(resolveNotice(ok('  お知らせ本文  '), NORMAL)?.text).toBe('お知らせ本文')
  })

  it('返すハッシュは表示文面のハッシュと一致する（消したら確実に消える）', () => {
    const n = resolveNotice(ok('  お知らせ本文  '), NORMAL)
    expect(n?.hash).toBe(noticeHash('お知らせ本文'))
    // その hash を既読として渡せば、次からは出ない。
    expect(resolveNotice(ok('  お知らせ本文  '), { demo: false, dismissedHash: n!.hash })).toBeNull()
  })
})

describe('noticeHash', () => {
  it('同じ文面は同じハッシュ', () => {
    expect(noticeHash('同じ文面')).toBe(noticeHash('同じ文面'))
  })

  it('違う文面は違うハッシュ', () => {
    expect(noticeHash('文面A')).not.toBe(noticeHash('文面B'))
  })

  it('1文字違い・並べ替えも区別する', () => {
    expect(noticeHash('メンテは7/30です')).not.toBe(noticeHash('メンテは7/31です'))
    expect(noticeHash('AB')).not.toBe(noticeHash('BA'))
  })

  it('空文字でも安定した文字列を返す', () => {
    expect(noticeHash('')).toBe(noticeHash(''))
    expect(typeof noticeHash('')).toBe('string')
    expect(noticeHash('')).not.toBe('')
  })

  it('長文でも短い固定長キーに収まる（保存キーとして使う）', () => {
    expect(noticeHash('あ'.repeat(400)).length).toBeLessThanOrEqual(16)
  })
})

describe('LITUS_SITE_URL', () => {
  // 脱出経路は status.json に依存させない（壊れているかもしれない同じ配信路に乗せない）。
  // このURLは常にコード側の固定値であること。
  it('litus.waiteu.dev への https 固定URL', () => {
    expect(LITUS_SITE_URL).toBe('https://litus.waiteu.dev/')
  })
})
