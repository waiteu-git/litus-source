/**
 * リアペ確認訂正（経路A・経路B）が配線から外れていないかを止めるラチェット（2026-09-18）。
 *
 * `shouldReconcileFirstSubmit` / `shouldReconcileResubmit` の単体テストは関数を消されても
 * 配線から外されても緑のままなので、配線をソースで見る（`portalGuardWiring.test.ts` と同じ技法・
 * 同じ理由。あちらは portalAction の配線漏れで実機事故を起こした前例のラチェット）。
 *
 * 本ファイルはコンポーネントを import/render せず、ソーステキストへの文字列・正規表現一致で検証する
 * （設計上の意図的な選択＝ `AttendanceEngineProvider.tsx` は RN コンポーネントのためテスト対象外という
 * 既存の層分離を踏襲する）。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync('src/attendance/AttendanceEngineProvider.tsx', 'utf8')

/** マーカー（末尾が `(` の呼び出し名）から、対応する閉じ括弧までの呼び出し全文を抜き出す。 */
function extractCall(source: string, marker: string): string {
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`marker not found in source: ${marker}`)
  const openIdx = start + marker.length - 1
  let depth = 0
  let i = openIdx
  for (; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')') {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(openIdx, i + 1)
}

describe('🔴 リアペ確認訂正（経路A・経路B）はソースから配線が外れていない', () => {
  it('経路A・経路Bの判定呼び出しがどちらもソースに存在する（呼び出し削除・配線外しへの回帰防止）', () => {
    expect(src).toContain('shouldReconcileFirstSubmit(')
    expect(src).toContain('shouldReconcileResubmit(')
  })

  it('両経路とも、成功記録の直前で直前の失敗理由をnullへ戻している（2箇所とも）', () => {
    // 二重訂正・古い失敗理由の使い回しを防ぐための順序。1箇所しか無ければどちらかの経路が
    // クリアし忘れている（＝古い unconfirmed が残り続け、次回以降の訂正判定を誤らせる）。
    const pattern = /reactionLastFailOutcomeRef\.current = null\s*\n\s*recordReactionDiag\('ok'/g
    const matches = src.match(pattern) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('経路Aは rec.reactionSubmitted という「その回の新鮮な値」を読む（reactionSubmittedRef.current という1テンポ古い値ではない）', () => {
    // reactionSubmittedRef は次のレンダーまで更新されないため、dispatch と同じハンドラ内で
    // 読むと古い値を掴む恐れがある（設計書の理由）。ここが reactionSubmittedRef.current に
    // 戻っていたら、タイミング依存の回帰バグが静かに再発している。
    const call = extractCall(src, 'shouldReconcileFirstSubmit(')
    expect(call).toContain('rec.reactionSubmitted')
    expect(call).not.toContain('reactionSubmittedRef.current')
  })

  it('確認タイマー列（2500/6000/11000ms）はこのファイルの変更で触られていない（Global Constraint）', () => {
    // 設計書・実装計画の Global Constraint: 確認タイマー本体には一切手を入れない。
    // 今回の4件修正でこの値が消える/変わるのは、それ自体が制約違反のサイン。
    expect(src).toContain('}, 2500)')
    expect(src).toContain('}, 6000)')
    expect(src).toContain('}, 11000)')
  })

  it('経路A・経路Bとも、必須フロー除外（required:）付きで判定関数を呼んでいる', () => {
    // I1: 経路Bは元々 required を見ておらず、必須提出でも ajax 受理だけで警告を消していた
    // （このアプリで避けるべき害の方向＝実際は未確定なのに「大丈夫」と学生に誤解させる）。
    // 呼び出しに required: が無ければこの穴が再発している。
    const callA = extractCall(src, 'shouldReconcileFirstSubmit(')
    const callB = extractCall(src, 'shouldReconcileResubmit(')
    expect(callA).toContain('required:')
    expect(callB).toContain('required:')
  })
})
