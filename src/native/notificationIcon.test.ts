import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  findPluginEntry,
  parsePngHeader,
  hasAlphaChannel,
  isValidNotificationIconHeader,
  NOTIFICATION_ICON_PATH,
} from './notificationIcon'
import { COLORS } from '../theme.palette'

const ROOT = join(__dirname, '..', '..')
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))
const plugins: unknown[] = appJson.expo.plugins

describe('findPluginEntry', () => {
  it('文字列エントリとタプルエントリが混在する配列から取り出す', () => {
    const list = ['expo-font', ['expo-notifications', { icon: './a.png' }], 'expo-status-bar']
    expect(findPluginEntry(list, 'expo-notifications')).toEqual({
      name: 'expo-notifications',
      props: { icon: './a.png' },
    })
  })

  it('props 無しの文字列エントリは空の props を返す', () => {
    expect(findPluginEntry(['expo-font'], 'expo-font')).toEqual({ name: 'expo-font', props: {} })
  })

  it('無ければ null', () => {
    expect(findPluginEntry(['expo-font'], 'expo-notifications')).toBeNull()
    expect(findPluginEntry([], 'expo-notifications')).toBeNull()
  })
})

describe('parsePngHeader / hasAlphaChannel', () => {
  it('PNG シグネチャが無ければ null', () => {
    expect(parsePngHeader(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(parsePngHeader(new Uint8Array(40))).toBeNull()
  })

  /**
   * ステータスバーの小アイコンは**アルファチャンネルだけ**を使う。
   * 現在のランチャーアイコン（assets/icon.png）は colorType 2 ＝ アルファが無いため、
   * これを小アイコンに使うと全画素が不透明扱いになり「白い四角」として描かれる。
   * 実測値をここで固定して、同じ系統の素材を渡す事故を落とす。
   */
  it('assets/icon.png はアルファを持たない（小アイコンに使えない実測値）', () => {
    const h = parsePngHeader(readFileSync(join(ROOT, 'assets/icon.png')))!
    expect(h.colorType).toBe(2)
    expect(hasAlphaChannel(h.colorType)).toBe(false)
    expect(isValidNotificationIconHeader(h)).toBe(false)
  })

  it('assets/adaptive-icon.png はアルファを持つ', () => {
    const h = parsePngHeader(readFileSync(join(ROOT, 'assets/adaptive-icon.png')))!
    expect(h).toMatchObject({ width: 1024, height: 1024, colorType: 6, interlace: 0 })
    expect(hasAlphaChannel(h.colorType)).toBe(true)
    expect(isValidNotificationIconHeader(h)).toBe(true)
  })

  it('正方形でない・96px未満・インタレースは不可', () => {
    expect(isValidNotificationIconHeader({ width: 192, height: 96, bitDepth: 8, colorType: 6, interlace: 0 })).toBe(false)
    expect(isValidNotificationIconHeader({ width: 64, height: 64, bitDepth: 8, colorType: 6, interlace: 0 })).toBe(false)
    expect(isValidNotificationIconHeader({ width: 96, height: 96, bitDepth: 8, colorType: 6, interlace: 1 })).toBe(false)
    expect(isValidNotificationIconHeader({ width: 96, height: 96, bitDepth: 8, colorType: 6, interlace: 0 })).toBe(true)
  })
})

describe('app.json の expo-notifications プラグイン設定', () => {
  const entry = findPluginEntry(plugins, 'expo-notifications')

  /**
   * 設定が無いと expo-notifications は prebuild 時に props 無しで自動適用され、
   * meta-data と各 dpi の notification_icon.png を**削除する**（withNotificationsAndroid.js）。
   * その結果 small icon は applicationInfo.icon（＝@mipmap/ic_launcher）へフォールバックする。
   */
  it('エントリが存在する', () => {
    expect(entry).not.toBeNull()
  })

  it('tint 色がパレットの emerald と一致する（トークンからの乖離を防ぐ）', () => {
    expect(String(entry?.props.color).toLowerCase()).toBe(COLORS.emerald.toLowerCase())
  })

  /**
   * defaultChannel は FCM 用の meta-data を焼くだけで、本製品には FCM が存在しない
   * （google-services.json なし・firebase 依存ゼロ）＝完全に不活性。書かない。
   */
  it('defaultChannel を持たない', () => {
    expect(entry?.props).not.toHaveProperty('defaultChannel')
  })

  it('sounds を持たない（カスタム音は入れない）', () => {
    expect(entry?.props).not.toHaveProperty('sounds')
  })

  /**
   * icon プロパティは実在する妥当な PNG を指していなければならない。
   * 指していないと prebuild が
   * "Encountered an issue resizing Android notification icon" で落ちてビルドできない。
   */
  it('icon プロパティがあるなら実在し、小アイコンとして妥当な PNG である', () => {
    const icon = entry?.props.icon
    if (icon === undefined) return
    expect(typeof icon).toBe('string')
    const p = join(ROOT, String(icon))
    expect(existsSync(p)).toBe(true)
    const h = parsePngHeader(readFileSync(p))
    expect(h).not.toBeNull()
    expect(isValidNotificationIconHeader(h!)).toBe(true)
  })

  /**
   * ラチェット: 白抜きアイコンを置いたのに app.json へ配線し忘れると、
   * prebuild が meta-data ごと消して**何も変わらない**（手で drawable を置く回避策も消される）。
   * 素材が現れた瞬間に配線を強制する。
   */
  it('assets/notification-icon.png を置いたら app.json の icon がそれを指す', () => {
    if (!existsSync(join(ROOT, NOTIFICATION_ICON_PATH))) return
    expect(entry?.props.icon).toBe(`./${NOTIFICATION_ICON_PATH.replace(/\\/g, '/')}`)
  })
})
