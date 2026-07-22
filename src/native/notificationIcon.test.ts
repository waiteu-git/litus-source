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
   * **現在このエントリは意図的に置いていない。**
   *
   * expo-notifications の config plugin はルートで Android と iOS の両方に適用され、
   * withNotificationsIOS.js:11-12 が `aps-environment` を entitlements へ**無条件で**書き込む。
   * 本製品はプッシュを一切使わない（FCMなし・google-services.jsonなし・プッシュトークン取得0件）ので、
   * Push Notifications capability を宣言するとストアのデータセーフティ申告と食い違う。
   *
   * 自動適用はされない（expo-module.config.json に plugin フィールドが無く、
   * プラグイン未記載でビルドした v101 の merged manifest に通知 meta-data が0件であることを実測）。
   * したがって「書かない」で iOS 側の副作用を確実に避けられる。
   *
   * 白抜きアイコン素材（assets/notification-icon.png）が用意できた時点で、
   * **iOS への波及の手当てとセットで**エントリを足すこと。
   */
  it('素材が無いうちはエントリを置かない（iOSにaps-environmentを書き込むため）', () => {
    if (existsSync(join(ROOT, NOTIFICATION_ICON_PATH))) return // 素材があるなら下の条件群で検証する
    expect(entry).toBeNull()
  })

  it('エントリを置くなら tint 色はパレットの emerald と一致する（トークンからの乖離を防ぐ）', () => {
    if (!entry) return
    expect(String(entry.props.color).toLowerCase()).toBe(COLORS.emerald.toLowerCase())
  })

  /**
   * defaultChannel は FCM 用の meta-data を焼くだけで、本製品には FCM が存在しない
   * （google-services.json なし・firebase 依存ゼロ）＝完全に不活性。
   * しかもチャンネルは作成後に属性を変更できないので、不活性なゴミチャンネルが恒久的に残る。書かない。
   */
  it('defaultChannel を持たない', () => {
    if (!entry) return
    expect(entry.props).not.toHaveProperty('defaultChannel')
  })

  it('sounds を持たない（カスタム音は入れない）', () => {
    if (!entry) return
    expect(entry.props).not.toHaveProperty('sounds')
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
   * ラチェット: 白抜きアイコンを置いたのに app.json へ配線し忘れると何も変わらない。
   * 素材が現れた瞬間に配線を強制する。
   */
  it('assets/notification-icon.png を置いたら app.json の icon がそれを指す', () => {
    if (!existsSync(join(ROOT, NOTIFICATION_ICON_PATH))) return
    expect(entry?.props.icon).toBe('./' + NOTIFICATION_ICON_PATH)
  })
})
