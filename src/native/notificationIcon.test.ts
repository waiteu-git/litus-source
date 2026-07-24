import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  findPluginEntry,
  findPluginIndex,
  parsePngHeader,
  hasAlphaChannel,
  isValidNotificationIconHeader,
  NOTIFICATION_ICON_PATH,
  APS_STRIPPER_PLUGIN,
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

describe('findPluginIndex', () => {
  it('文字列エントリとタプルエントリの両方で位置を返す', () => {
    const list = ['expo-font', ['expo-notifications', { icon: './a.png' }], './plugins/x.js']
    expect(findPluginIndex(list, 'expo-font')).toBe(0)
    expect(findPluginIndex(list, 'expo-notifications')).toBe(1)
    expect(findPluginIndex(list, './plugins/x.js')).toBe(2)
    expect(findPluginIndex(list, 'nope')).toBe(-1)
  })
})

describe('withNoApsEnvironment', () => {
  it('entitlements から aps-environment を取り除く', async () => {
    const { stripApsEnvironment } = await import('../../plugins/apsEnvironment.js')
    const ent = { 'aps-environment': 'development', 'keychain-access-groups': ['x'] }
    const r = stripApsEnvironment(ent)
    expect(r).not.toHaveProperty('aps-environment')
    // 他のキーは巻き添えにしない（entitlements は他プラグインとの共有面）。
    expect(r['keychain-access-groups']).toEqual(['x'])
  })

  it('キーが無い・オブジェクトでない入力でも例外を投げない', async () => {
    const { stripApsEnvironment } = await import('../../plugins/apsEnvironment.js')
    expect(() => stripApsEnvironment({})).not.toThrow()
    expect(() => stripApsEnvironment(null)).not.toThrow()
    expect(() => stripApsEnvironment(undefined)).not.toThrow()
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
   * **2026-07-24 訂正**: 以前ここには「エントリを書かなければ iOS の副作用を避けられる」と
   * 書いてあったが、**それは誤りだった**。
   *
   * `@expo/prebuild-config` の `withDefaultPlugins.js` は `versionedExpoSDKPackages` に
   * `expo-notifications` を含んでおり、`createLegacyPlugin` → `withStaticPlugin` が
   * **パッケージ同梱の app.plugin.js を解決して props 無しで実行する**（node_modules 実読で確認）。
   * `withNotifications.js` は Android と iOS の両方を `props || {}` で適用するので、
   * 未記載でも `withNotificationsIOS` が走り `aps-environment='development'` が書き込まれる。
   *
   * 「v101 の merged manifest に通知 meta-data が0件」という当時の実測は、
   * **「適用されていない」ではなく「props 無しで適用されてアイコンが削除された」**の証拠だった
   * （props 無しの `setNotificationIconAsync` は meta-data と drawable を消す側に落ちる）。
   * ＝ 撤去は Android の白い塊を温存しただけで、iOS の副作用は止められていなかった。
   *
   * 対応: エントリは**置く**（Android の配線に必要）。iOS の副作用は
   * `./plugins/withNoApsEnvironment.js` を後ろに置いて mod で落とす。
   */
  it('expo-notifications エントリが存在する（Androidのsmall icon配線に必須）', () => {
    expect(entry).not.toBeNull()
  })

  /**
   * ラチェット: エントリを置く以上、iOS の `aps-environment` を落とす mod が
   * **必ず expo-notifications より前に**居ること。
   *
   * ⚠ 直感に反する順序なので、"整理" で入れ替えられないようテストで固定する。
   * `withMod` は同じ mod に後から登録した action を**外側**に積む（古い方を nextMod として渡す）＝
   * **後に登録した action ほど先に走る**。実測（2026-07-24・prebuild 成果物）:
   *   - 後ろに置く → `aps-environment=development` が残る
   *   - 前に置く   → entitlements が `<dict/>` になる
   *
   * プッシュは一切使わない（FCMなし・google-services.jsonなし・プッシュトークン取得0件）ので、
   * Push Notifications capability の宣言はデータセーフティ申告と食い違い、
   * App ID 側で capability 未設定ならプロビジョニング不一致でビルド/提出が落ちる。
   */
  it('aps-environment を落とす plugin が expo-notifications より前にある', () => {
    const iNotif = findPluginIndex(plugins, 'expo-notifications')
    const iStrip = findPluginIndex(plugins, APS_STRIPPER_PLUGIN)
    expect(iStrip).toBeGreaterThanOrEqual(0)
    expect(iNotif).toBeGreaterThan(iStrip)
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
