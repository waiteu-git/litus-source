import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(__dirname, '..')
const OWNER = 'ui/SwipeToHide.tsx'

function listSources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listSources(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/** リストを生成する要素（この前に panHandlers が展開されていれば祖先＝包んでいる）。 */
const LIST_TAG = /<(FlatList|SectionList|VirtualizedList|ScrollView)\b/

/**
 * ラチェット: スワイプの PanResponder を**リストを包む側**に置き続けさせる。
 *
 * iOS の `RCTScrollViewComponentView._shouldDisableScrollInteraction` は「JS が responder を
 * 取ったか」を **ScrollView 自身の祖先方向にしか探さない**（`self.superview` を辿るだけ）。
 * PanResponder を行の中に置くと行は ScrollView の子孫なので永久にヒットせず、
 * `touchesShouldCancelInContentView:` が YES を返し続けて UIScrollView がタッチをキャンセルする
 * ＝「掴めるのに上下に取られて戻る／掴み直しが要る」。2026-08-13 に実機で踏んだ。
 *
 * この失敗は **Android では起きない**（Android は `onShouldBlockNativeResponder` が効く）。
 * つまり型検査もテストも Android 実機も素通りし、iOS だけが壊れる。構造でしか守れないので
 * ラチェットにする。しきい値を触っても代わりにならない点に注意（実際、96→56px と
 * 0.35→0.25 に緩めても症状は変わらなかった）。
 */
describe('スワイプ司令塔の配置ガード（ラチェット）', () => {
  const files = listSources(SRC)

  it('SwipeToHide 自身は行に panHandlers を展開しない（公開するのはホストの分だけ）', () => {
    const src = readFileSync(join(SRC, 'ui/SwipeToHide.tsx'), 'utf8')
    // 行のJSX（SwipeToHide 関数の本体）に展開があってはいけない。
    const rowBody = src.slice(src.indexOf('export function SwipeToHide('))
    expect(rowBody).not.toMatch(/\{\s*\.\.\.[A-Za-z0-9_.]*panHandlers\s*\}/)
  })

  it('SwipeToHide を使う画面は useSwipeHideHost を使い、リストより先に panHandlers を展開している', () => {
    // 判定は **JSX での使用**。コメント中の言及（swipeHideDecision.ts が構造の理由で参照している）
    // を拾うと、実際には行を描画しないファイルまで巻き込む。
    const users = files.filter((f) => {
      const rel = relative(SRC, f).replace(/\\/g, '/')
      if (rel === OWNER) return false
      return /<SwipeToHide[\s/>]/.test(readFileSync(f, 'utf8'))
    })
    expect(users.length).toBeGreaterThan(0)

    for (const f of users) {
      const rel = relative(SRC, f).replace(/\\/g, '/')
      const src = readFileSync(f, 'utf8')

      expect(src, `${rel}: useSwipeHideHost を使うこと`).toMatch(/\buseSwipeHideHost\b/)

      const spread = src.search(/\{\s*\.\.\.[A-Za-z0-9_.]*panHandlers\s*\}/)
      expect(spread, `${rel}: panHandlers を展開すること`).toBeGreaterThanOrEqual(0)

      const list = src.search(LIST_TAG)
      expect(list, `${rel}: リストが見つからない（ガードの前提が崩れている）`).toBeGreaterThanOrEqual(0)
      expect(
        spread,
        `${rel}: panHandlers はリストより前＝リストを包む位置に展開すること（行の中に置くと iOS で効かない）`,
      ).toBeLessThan(list)
    }
  })
})
