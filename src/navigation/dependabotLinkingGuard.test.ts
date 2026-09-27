import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ラチェット: react-navigation の linking 機構（NavigationContainer の `linking` prop・
 * `useLinkTo`・`Link`）と `expo-router` を、意図せず有効化していないこと。
 *
 * 2026-09-25 の Dependabot 再判定（メモリ litus-expo-version-policy の同日節）で、
 * `decode-uri-component`（GHSA-vcc3-ghjq-m6fr・query-string 経由・react-navigation の
 * getStateFromPath.js が使う）は**出荷バンドルに実在する**が、閉じているのはコードの構造では
 * なく「NavigationContainer に linking を渡していない」という設定だけだった。台帳はこれを
 * dismiss しつつ「linking を渡す／useLinkTo・Link を使う／expo-router を入れる時は再判定」と
 * 条件で書いた。**このテストがその条件の見張り**＝dismiss 済みの Dependabot アラートは、
 * ここが赤くならない限り再オープンされない。
 *
 * ウィジェットの `litus://` ディープリンク（src/widget/widgetLinking.ts の自前
 * `parseWidgetUrl`）は react-navigation の linking 機構を経由しないので対象外
 * （誤検知させない＝下の negative control で明示する）。
 */

const ROOT = join(__dirname, '..', '..')
const REASON =
  'linking 経路を有効にすると decode-uri-component（GHSA-vcc3-ghjq-m6fr）の発火条件が開く。' +
  'dismiss 済みの Dependabot アラートを再オープンして再判定するか、' +
  'decode-uri-component@0.5.0 への pnpm overrides を入れること。' +
  '根拠＝メモリ litus-expo-version-policy の2026-09-25節。'

/** ファイル内の `<NavigationContainer …>` 開始タグを全件返す（1ファイルに複数あっても取りこぼさない）。 */
function findNavigationContainerTags(src: string): string[] {
  const tags: string[] = []
  let from = 0
  while (true) {
    const start = src.indexOf('<NavigationContainer', from)
    if (start === -1) break
    const end = src.indexOf('>', start)
    tags.push(src.slice(start, end === -1 ? undefined : end + 1))
    from = end === -1 ? src.length : end + 1
  }
  return tags
}

function hasLinkingProp(tag: string): boolean {
  return /\blinking\s*=/.test(tag)
}

function findReactNavigationLinkingImports(src: string): string[] {
  const found: string[] = []
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"]@react-navigation\/native['"]/g
  let m: RegExpExecArray | null
  while ((m = importRe.exec(src))) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim()
      if (name === 'useLinkTo' || name === 'Link') found.push(name)
    }
  }
  return found
}

function listSources(dir: string): string[] {
  const { readdirSync } = require('node:fs') as typeof import('node:fs')
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listSources(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

describe('検出ロジック', () => {
  it('NavigationContainer の linking prop を検出する', () => {
    expect(hasLinkingProp('<NavigationContainer linking={config}>')).toBe(true)
    expect(hasLinkingProp('<NavigationContainer\n  ref={r}\n  linking={config}\n>')).toBe(true)
  })

  it('linking の無い NavigationContainer では検出しない', () => {
    expect(hasLinkingProp('<NavigationContainer ref={r} theme={t}>')).toBe(false)
  })

  it('1ファイルに複数の NavigationContainer があっても全件を個別に検出する（最初の1つだけを見て見逃さない）', () => {
    const src = [
      '<NavigationContainer ref={r1} theme={t1}>',
      '  <Stack.Navigator />',
      '</NavigationContainer>',
      '<NavigationContainer ref={r2} linking={config}>',
      '  <Stack.Navigator />',
      '</NavigationContainer>',
    ].join('\n')
    const tags = findNavigationContainerTags(src)
    expect(tags).toHaveLength(2)
    expect(hasLinkingProp(tags[0])).toBe(false)
    expect(hasLinkingProp(tags[1])).toBe(true)
  })

  it('useLinkTo / Link の named import を検出する', () => {
    expect(
      findReactNavigationLinkingImports("import { useLinkTo } from '@react-navigation/native'"),
    ).toEqual(['useLinkTo'])
    expect(
      findReactNavigationLinkingImports("import { NavigationContainer, Link } from '@react-navigation/native'"),
    ).toEqual(['Link'])
    expect(
      findReactNavigationLinkingImports("import { Link as NavLink } from '@react-navigation/native'"),
    ).toEqual(['Link'])
  })

  it('無関係な named import は検出しない', () => {
    expect(
      findReactNavigationLinkingImports("import { NavigationContainer, DefaultTheme } from '@react-navigation/native'"),
    ).toEqual([])
  })

  it('negative control: ウィジェットの自前 URL 解釈は react-navigation の linking import を含まない', () => {
    const src = readFileSync(join(ROOT, 'src/widget/widgetLinking.ts'), 'utf8')
    expect(findReactNavigationLinkingImports(src)).toEqual([])
    expect(src.includes('@react-navigation/native')).toBe(false)
  })

  it('negative control: app.json の scheme はこのガードの対象外（存在してもテストは関知しない）', () => {
    const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))
    expect(typeof appJson.expo.scheme).toBe('string')
  })
})

describe('Dependabot dismiss 前提のガード（ラチェット）', () => {
  it(`NavigationContainer に linking を渡さない（src 全体・App.tsx・index.ts の全 NavigationContainer が対象）。${REASON}`, () => {
    const offenders: string[] = []
    for (const file of listSources(join(ROOT, 'src'))) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      for (const tag of findNavigationContainerTags(readFileSync(file, 'utf8'))) {
        if (hasLinkingProp(tag)) offenders.push(`${rel} → linking`)
      }
    }
    for (const name of ['App.tsx', 'index.ts']) {
      const p = join(ROOT, name)
      for (const tag of findNavigationContainerTags(readFileSync(p, 'utf8'))) {
        if (hasLinkingProp(tag)) offenders.push(`${name} → linking`)
      }
    }
    expect(offenders).toEqual([])
  })

  it(`expo-router を依存に入れない。${REASON}`, () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect('expo-router' in deps).toBe(false)
  })

  it(`useLinkTo・Link（@react-navigation/native）を使わない。${REASON}`, () => {
    const offenders: string[] = []
    for (const file of listSources(join(ROOT, 'src'))) {
      const rel = file.replace(/\\/g, '/').split('/src/')[1]
      const hits = findReactNavigationLinkingImports(readFileSync(file, 'utf8'))
      for (const hit of hits) offenders.push(`${rel} → ${hit}`)
    }
    for (const name of ['App.tsx', 'index.ts']) {
      const p = join(ROOT, name)
      const hits = findReactNavigationLinkingImports(readFileSync(p, 'utf8'))
      for (const hit of hits) offenders.push(`${name} → ${hit}`)
    }
    expect(offenders).toEqual([])
  })
})
