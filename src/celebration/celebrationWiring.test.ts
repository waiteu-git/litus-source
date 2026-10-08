import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

/**
 * お祝いデザインの「つなぎ方」を守るラチェット（ソースを読む）。純粋ロジックは celebration.test.ts 等が守る。
 * ここが守るのは、画面側の配線が崩れた時に、型検査もテストも通ってしまう類の壊れ方:
 *  - 起動画面: 選択の読み込みが bootMode の決定より後になると、WebView が輪なしの HTML で先にマウントされ、
 *    後から source が変わってアニメが頭から再生し直される。
 *  - 文言の台帳が複数箇所に散ると、権利・事実の取り決め（celebration.test.ts）をすり抜ける。
 * 設計: docs/design/2026-10-08-celebration-mode.md
 */

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * コメントを除いたコード（コメントの中の語を実装の違反と取り違えない）。
 * 正規表現ではなく TypeScript の構文解析で出力し直す＝文字列の中の「//」（URL など）から行末が消えて、
 * その後ろの違反を見逃す穴が無い（独立レビュー 2026-10-08 の指摘）。
 */
const stripComments = (src: string): string => {
  const sf = ts.createSourceFile('x.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  return ts.createPrinter({ removeComments: true }).printFile(sf)
}

describe('stripComments（検査の道具そのものの確認）', () => {
  it('陽性の対照: 文字列の中の「//」の後ろに違反があっても検出できる（行末が消えない）', () => {
    const src = 'const u = "https://x.example/a"; const n = "硤合"'
    expect(stripComments(src)).toContain('硤合')
  })
  it('陰性の対照: コメントの中の語は取り除かれる（行コメント・ブロックコメント）', () => {
    expect(stripComments('// 硤合\nconst a = 1')).not.toContain('硤合')
    expect(stripComments('/* ノーベル */ const a = 1')).not.toContain('ノーベル')
  })
  it('日本語の文字列は escape されずそのまま出る', () => {
    expect(stripComments('const t = "ノーベル化学賞"')).toContain('ノーベル化学賞')
  })
})

function indexOrFail(src: string, needle: string, from = 0): number {
  const i = src.indexOf(needle, from)
  if (i < 0) throw new Error(`見つからない: ${needle}`)
  return i
}

describe('起動画面（LoginGate）: お祝いは bootMode より先に確定し、WebView と2行が同じフラグを使う', () => {
  const src = read('src/auth/LoginGate.tsx')
  // 初期化 effect（マウント時に1回走る async 即時関数）の本体
  const start = indexOrFail(src, ';(async () => {', indexOrFail(src, 'const [bootCelebrate, setBootCelebrate]'))
  const end = indexOrFail(src, '}, [])', start)
  const init = src.slice(start, end)

  it('読み込みは store の loadCelebrationChoice と純粋関数 isCelebrationActive を通す', () => {
    expect(src).toContain("import { loadCelebrationChoice } from '../storage/celebrationStore'")
    expect(src).toContain("import { isCelebrationActive } from '../celebration/celebration'")
    expect(init).toContain('setBootCelebrate(isCelebrationActive(await loadCelebrationChoice(), new Date()))')
  })

  it('setBootCelebrate は、規約の判定（loadAcceptedTermsVersion）より前、最初の setBootMode より前', () => {
    const iCel = indexOrFail(init, 'setBootCelebrate(')
    const iTerms = indexOrFail(init, 'loadAcceptedTermsVersion()')
    const iMode = indexOrFail(init, 'setBootMode(')
    expect(iCel).toBeLessThan(iTerms)
    expect(iCel).toBeLessThan(iMode)
  })

  it('WebView の HTML は第3引数に celebrateNow を渡し、2引数の旧形・直読み値のままの形は残らない', () => {
    expect(src).toContain('bootLogoHtml(variant, bootMode, celebrateNow)')
    expect(src).not.toMatch(/bootLogoHtml\(variant, bootMode(, bootCelebrate)?\)/)
  })

  it('2行は celebrateNow && bootMode != null の時だけ、スプラッシュ色の被せ（fadeNeeded）より下に描く', () => {
    const iText = indexOrFail(src, '{celebrateNow && bootMode != null ? <BootCelebration variant={variant} topInset={insets.top} /> : null}')
    const iFade = indexOrFail(src, '{fadeNeeded ? (')
    expect(iText).toBeLessThan(iFade)
  })

  it('celebrateNow は、Provider が ready ならその active、ready 前だけ起動時の直読み値（設定の切替が再ログインの起動画面にも届く）', () => {
    expect(src).toContain("import { useCelebration } from '../celebration/CelebrationProvider'")
    expect(src).toContain('const celebration = useCelebration()')
    expect(src).toContain('const celebrateNow = celebration.ready ? celebration.active : bootCelebrate')
  })

  it('決定した選択は state（bootCelebrate）に1つだけで、他のフラグを新設しない', () => {
    expect(src.match(/useState\(false\)/g)?.length ?? 0).toBeGreaterThan(0)
    expect(src.split('setBootCelebrate(').length - 1).toBe(1)
  })
})

describe('ホーム: 最上段（ScreenHint の直前）に1枚だけ。ホームの並び設定の外側', () => {
  const src = read('src/screens/HomeScreen.tsx')
  it('CelebrationCard は ScreenHint の直前に1回だけ', () => {
    expect(src.split('<CelebrationCard />').length - 1).toBe(1)
    expect(indexOrFail(src, '<CelebrationCard />')).toBeLessThan(indexOrFail(src, '<ScreenHint hintKey="home" />'))
  })
  it('homeLayout の map の内側には入れない（並び替え・保存済みの並びの移行を起こさない）', () => {
    const iMap = src.indexOf('return homeLayout')
    expect(iMap).toBeGreaterThan(0)
    expect(indexOrFail(src, '<CelebrationCard />')).toBeLessThan(iMap)
  })
})

describe('カード: オフ/期限後/読み込み前は描かない・リンクは外部ブラウザ・非公式を明記・文言は台帳から', () => {
  const src = read('src/home/CelebrationCard.tsx')
  it('active でなければ null', () => {
    expect(src).toContain('if (!active) return null')
  })
  it('地・角丸・余白は標準のガラスカード（ui.card）に任せ、淡い黄みの地を自前で作らない（警告面と見分けがつかなくなる）', () => {
    const code = stripComments(src)
    expect(code).toContain('ui.card')
    expect(code).not.toMatch(/backgroundColor/)
    expect(code).toContain('ui.valueColor')
    expect(code).toContain('ui.labelColor')
  })
  it('リンクは Linking.openURL(CELEBRATION_LINK_URL)＝外部ブラウザ。アプリ内 WebView は使わない（大学ログインの Cookie を共有するため）', () => {
    expect(src).toContain('Linking.openURL(CELEBRATION_LINK_URL)')
    expect(stripComments(src)).not.toMatch(/WebView|navigate\(/)
  })
  it('リンクは role=link ＋読み上げ文言。非公式の注記を描く', () => {
    expect(src).toContain('accessibilityRole="link"')
    expect(src).toContain('CELEBRATION_COPY.cardLinkA11y')
    expect(src).toContain('CELEBRATION_COPY.cardNote')
  })
  it('素の react-native の Text を使わない（共通 Text ラッパー）', () => {
    expect(src).toContain("import { Text } from '../ui/Text'")
    expect(src).not.toMatch(/import \{[^}]*\bText\b[^}]*\} from 'react-native'/)
  })
})

describe('カードの絵（フラスコと星）: 画像ではなく react-native-svg の図形・色は台帳から・読み上げない', () => {
  const src = read('src/celebration/CelebrationMark.tsx')
  const code = stripComments(src)
  it('svg の図形だけで、画像・外部URLを使わない', () => {
    expect(code).toContain("from 'react-native-svg'")
    expect(code).not.toMatch(/<Image|require\(|uri:|https?:|data:/)
  })
  it('色は celebrationColors（台帳）から取り、画面側に生の色を書かない', () => {
    expect(code).toContain('celebrationColors(variant)')
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
  it('装飾なので読み上げない', () => {
    expect(code).toContain('accessible={false}')
    expect(code).toContain('importantForAccessibility="no-hide-descendants"')
  })
  it('カードは絵として CelebrationMark を使い、ホームの Ionicons のリボンを使わない', () => {
    const card = stripComments(read('src/home/CelebrationCard.tsx'))
    expect(card).toMatch(/<CelebrationMark\s+variant=\{variant\}\s+size=\{40\}\s*\/>/)
    expect(card).not.toContain('ribbon-outline')
  })
  it('起動画面の2行は文字だけ（輪と重なる飾りを足さない）', () => {
    const boot = stripComments(read('src/auth/BootCelebration.tsx'))
    expect(boot).not.toMatch(/Ionicons|<Svg|<Image/)
  })
})

describe('見出しの線: active の時だけ・絶対配置（レイアウトを動かさない）', () => {
  const src = read('src/ui/screen.tsx')
  it('celebrating の時だけ描く', () => {
    expect(src).toContain('{celebrating ? (')
    expect(src).toContain('const { active: celebrating } = useCelebration()')
  })
  it('線のスタイルは絶対配置で、見出し行の下の余白に収まる', () => {
    expect(src).toMatch(/celebLine: \{ position: 'absolute', left: 0, bottom: -4, width: 28, height: 2/)
  })
  it('線は題名の真下から始める（アイコンがあれば アイコン22＋gap7 の分だけ右）', () => {
    expect(src).toContain('const TITLE_OFFSET_WITH_ICON = 29')
    expect(src).toContain('left: icon ? TITLE_OFFSET_WITH_ICON : 0')
  })
})

describe('設定: 表示 › テーマの直下・行は rowVisible の時だけ・切替は setEnabled', () => {
  const src = read('src/screens/SettingsScreen.tsx')
  it('テーマ → お祝いデザイン → 時間割の表示 の順', () => {
    const iTheme = indexOrFail(src, '>テーマ</Text>')
    const iCel = indexOrFail(src, 'CELEBRATION_COPY.settingLabel')
    const iTt = indexOrFail(src, '>時間割の表示</Text>')
    expect(iTheme).toBeLessThan(iCel)
    expect(iCel).toBeLessThan(iTt)
  })
  it('rowVisible で出し分け・オン/オフの2択・値は active', () => {
    expect(src).toContain('{celebration.rowVisible ? (')
    expect(src).toContain("value={celebration.active ? 'on' : 'off'}")
    expect(src).toContain("onChange={(k) => celebration.setEnabled(k === 'on')}")
    expect(src).toContain('CELEBRATION_COPY.settingNote')
  })
})

describe('アプリ: CelebrationProvider は DisplaySettingsProvider の内側で、画面群を包む', () => {
  const src = read('App.tsx')
  it('開きと閉じの入れ子の順', () => {
    const a = indexOrFail(src, '<DisplaySettingsProvider>')
    const b = indexOrFail(src, '<CelebrationProvider>')
    const c = indexOrFail(src, '<AssignmentsVersionProvider>')
    const c2 = indexOrFail(src, '</AssignmentsVersionProvider>')
    const b2 = indexOrFail(src, '</CelebrationProvider>')
    const a2 = indexOrFail(src, '</DisplaySettingsProvider>')
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(c2).toBeLessThan(b2)
    expect(b2).toBeLessThan(a2)
  })
})

describe('Provider: 読み込み前は出さない（オフの人に一瞬だけ出ない）', () => {
  const src = read('src/celebration/CelebrationProvider.tsx')
  it('active と rowVisible は、ready を前提にする純粋関数 celebrationState から取る（挙動は celebration.test.ts が守る）', () => {
    expect(src).toContain('celebrationState(ready, choice, new Date())')
  })
  it('保存の失敗でも操作は止めない（state は先に更新）', () => {
    expect(src).toContain('setChoice(next)')
    expect(src).toContain('saveCelebrationChoice(next).catch(() => undefined)')
  })
})

describe('文言は台帳（src/celebration/celebration.ts）の1か所だけ', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p)
    }
    return out
  }
  it('受賞者の氏名（硤合）は台帳以外のソース（コメントを除く）に無い', () => {
    const offenders = walk(join(ROOT, 'src'))
      .filter((p) => stripComments(readFileSync(p, 'utf8')).includes('硤合'))
      .map((p) => p.slice(ROOT.length + 1))
    expect(offenders).toEqual(['src/celebration/celebration.ts'])
  })
  it('「ノーベル」も台帳以外のソース（コメントを除く）に文字列として無い', () => {
    const offenders = walk(join(ROOT, 'src'))
      .filter((p) => !p.endsWith('src/celebration/celebration.ts'))
      .filter((p) => stripComments(readFileSync(p, 'utf8')).includes('ノーベル'))
      .map((p) => p.slice(ROOT.length + 1))
    expect(offenders).toEqual([])
  })
})
