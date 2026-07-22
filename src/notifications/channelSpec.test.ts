import { describe, it, expect } from 'vitest'
import {
  CHANNEL_SPECS,
  toChannelInput,
  ATTENDANCE_CHANNEL_ID,
  ASSIGNMENT_CHANNEL_ID,
  CLASS_EVENT_CHANNEL_ID,
  BULLETIN_CHANNEL_ID,
  LETUS_NEWS_CHANNEL_ID,
} from './channelSpec'

/** テスト用の偽 enum（expo の AndroidImportance / AndroidNotificationVisibility の代役）。 */
const IMPORTANCE = { MAX: 5, HIGH: 4, DEFAULT: 3 }
const VISIBILITY = { PRIVATE: 2 }

describe('CHANNEL_SPECS', () => {
  /**
   * ラチェット: **チャンネルIDは出荷済み（versionCode 97以降）で変更不可**。
   * 変えると新IDで別チャンネルが作られ、ユーザーがOS設定で調整した
   * 音・重要度・ミュート・ロック画面表示が全部失われ、旧IDのチャンネルはOS設定に残り続ける。
   * Android は削除→同ID再作成でも旧設定を復活させるため、やり直しがきかない。
   */
  it('出荷済みのチャンネルIDと完全一致する（変更＝ユーザー設定の破壊）', () => {
    expect(CHANNEL_SPECS.map((s) => s.id)).toEqual([
      'attendance',
      'assignments',
      'class-events',
      'bulletins',
      'letus-updates',
    ])
    expect(ATTENDANCE_CHANNEL_ID).toBe('attendance')
    expect(ASSIGNMENT_CHANNEL_ID).toBe('assignments')
    expect(CLASS_EVENT_CHANNEL_ID).toBe('class-events')
    expect(BULLETIN_CHANNEL_ID).toBe('bulletins')
    expect(LETUS_NEWS_CHANNEL_ID).toBe('letus-updates')
  })

  it('IDが一意', () => {
    expect(new Set(CHANNEL_SPECS.map((s) => s.id)).size).toBe(CHANNEL_SPECS.length)
  })

  it('全チャンネルに日本語の name と description がある', () => {
    for (const s of CHANNEL_SPECS) {
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
      // ASCII のみ＝日本語になっていない（OS設定画面に英語が出る）。
      expect(/[^\x20-\x7e]/.test(s.name)).toBe(true)
      expect(/[^\x20-\x7e]/.test(s.description)).toBe(true)
    }
  })

  /**
   * 決定C: ロック画面で伏せるのは出席のみ。
   * 課題は「どの課題か」、掲示は「件名」が判断に直結するので伏せない。
   * PUBLIC を明示しない（既定の VISIBILITY_NO_OVERRIDE ＝ユーザーの全体設定に従う）。
   */
  it('lockscreenVisibility を持つのは出席チャンネルだけ', () => {
    const withVisibility = CHANNEL_SPECS.filter((s) => s.lockscreenVisibility !== undefined)
    expect(withVisibility.map((s) => s.id)).toEqual([ATTENDANCE_CHANNEL_ID])
    expect(withVisibility[0].lockscreenVisibility).toBe('private')
  })

  /**
   * AOSP の NotificationChannel は mVibrationEnabled の既定が false。
   * expo は渡さなかったキーの setter を呼ばないので、明示しない限り**全チャンネル無振動**になる。
   */
  it('全チャンネルで振動が有効かつパターンが妥当', () => {
    for (const s of CHANNEL_SPECS) {
      expect(s.enableVibrate).toBe(true)
      expect(s.vibrationPattern.length).toBeGreaterThan(0)
      for (const ms of s.vibrationPattern) expect(ms).toBeGreaterThanOrEqual(0)
    }
  })

  /**
   * sound / bypassDnd はチャンネル作成後に変更できない＝一度出荷すると恒久固定。
   * 今回は渡さない（既定通知音・DND尊重）と決めたので、うっかり足せないようラチェットする。
   */
  it('sound / bypassDnd を spec に持たない', () => {
    for (const s of CHANNEL_SPECS) {
      expect(s).not.toHaveProperty('sound')
      expect(s).not.toHaveProperty('bypassDnd')
    }
  })

  it('出席のみ MAX、他は HIGH', () => {
    expect(CHANNEL_SPECS.find((s) => s.id === ATTENDANCE_CHANNEL_ID)?.importance).toBe('max')
    for (const s of CHANNEL_SPECS.filter((x) => x.id !== ATTENDANCE_CHANNEL_ID)) {
      expect(s.importance).toBe('high')
    }
  })
})

describe('toChannelInput', () => {
  it('出席は lockscreenVisibility を含む', () => {
    const spec = CHANNEL_SPECS.find((s) => s.id === ATTENDANCE_CHANNEL_ID)!
    expect(toChannelInput(spec, { importance: IMPORTANCE, visibility: VISIBILITY })).toEqual({
      name: spec.name,
      description: spec.description,
      importance: IMPORTANCE.MAX,
      enableVibrate: true,
      vibrationPattern: spec.vibrationPattern,
      lockscreenVisibility: VISIBILITY.PRIVATE,
    })
  })

  /**
   * 未指定は「キーごと渡さない」でなければならない。
   * expo のネイティブ実装は args.containsKey で分岐するため、undefined を入れる実装だと
   * ユーザーのロック画面設定を上書きしうる（既定 VISIBILITY_NO_OVERRIDE を壊す）。
   */
  it('出席以外は lockscreenVisibility キー自体を含まない', () => {
    for (const spec of CHANNEL_SPECS.filter((s) => s.id !== ATTENDANCE_CHANNEL_ID)) {
      const input = toChannelInput(spec, { importance: IMPORTANCE, visibility: VISIBILITY })
      expect(input).not.toHaveProperty('lockscreenVisibility')
      expect(input.importance).toBe(IMPORTANCE.HIGH)
    }
  })
})
