import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ラチェット: 出席画面の「CLASSで確認してください」告知が消えていないことを検査する。
 *
 * ⚠ この文言は出席登録が実地未検証であることの利用者向け告知。消す時は必ず裁定を取ること。
 *
 * 出席の自動送信は間欠的に登録されない事象を追っている経路で、アプリが「出席を登録しました」と
 * 出しても実際には登録されていないことがある。この告知が黙って消えると、利用者が食い違いに
 * 気づく手段が無くなる＝意味が反転する。vitest は純粋ロジック層しか実行できないので、
 * rawColorGuard.test.ts と同じくソースを読む形で保全する。
 *
 * ⚠ (A) は「この表示は登録の成功を保証しません」等の一律の否定文を含めない裁定済み。
 *   outcome='ok' には attended（CLASSページの実測）と result.ok（応答一致・誤検出実績あり）の
 *   2経路があり、一律の否定は前者で過剰なため。経路ごとの出し分けも却下済み。復活させない。
 */
const src = readFileSync(join(__dirname, 'AttendanceScreen.tsx'), 'utf8')

describe('出席画面の未検証告知（ラチェット）', () => {
  it('成功カードに「CLASSの出欠に反映されているか」の注意が在る', () => {
    expect(src).toContain('※CLASSの出欠に反映されているか必ずご確認ください。')
  })

  it('画面上部に常設の「試験段階です」の注意が在る', () => {
    expect(src).toContain('出席の自動登録は試験段階です。登録できたかは必ずCLASSでご確認ください。')
  })

  it('常設側は ScreenHint に入れていない（×で永続的に消えるため安全告知に使えない）', () => {
    // ScreenHint の hintKey に文言を渡していない＝閉じられない要素として描いていること
    expect(src).not.toMatch(/ScreenHint[^>]*出席の自動登録は試験段階です/)
  })
})
