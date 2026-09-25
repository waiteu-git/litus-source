import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'))
const changelogMd = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')

/**
 * README.md と CHANGELOG.md は公開ミラー（litus-source）の訪問者が最初に読む面。
 * 版を上げても手で直す主体が居ないと、2世代前の版番号や「未配信・build 220」が出荷後も残る
 * （2026-09-25 に実際に見つかった）。`src/changelog.ts` は pre-commit と test が縛るが、この2つは縛られていなかった。
 */
describe('README.md / CHANGELOG.md が現行の版とずれない', () => {
  it('CHANGELOG.md の先頭の版見出しに、現行の versionName と build 番号が入っている', () => {
    const head = changelogMd.split('\n').find((l) => l.startsWith('## v'))
    expect(head).toBeDefined()
    expect(head).toContain(`v${appJson.expo.version}`)
    expect(head).toContain(`build ${appJson.expo.android.versionCode}`)
  })

  it('README.md に版番号（vX.Y.Z）を書かない（更新する主体が居ないので必ず腐る。版はストアのページで見せる）', () => {
    expect(readme).not.toMatch(/v\d+\.\d+\.\d+/)
  })
})
