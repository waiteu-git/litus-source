import { Share } from 'react-native'
import { buildShareContent } from './shareMessage'
import { canOpenShare } from './shareLock'

/** 直近に開いた時刻（メモリのみ。保存しない）。 */
let lastOpenedAt: number | null = null

/**
 * OS の共有シートを開く唯一の呼び出し点（設定「友だちに教える」の行からのみ。onPress={openShareSheet}）。
 * 設計: docs/design/2026-10-09-G-share-to-friends.md §5・実装者への禁止事項
 *
 * 結果は捨てる: 戻り値（iOS では共有先アプリの識別子を含む）を変数に取らない・then を付けない・待たない。
 * 失敗は握りつぶす（openLitusSite と同じ流儀＝外へ出る導線の失敗で画面を止めない。成功表示も出さない）。
 */
export function openShareSheet(): void {
  const content = buildShareContent()
  if (content === null) return // 紹介ページが未設定（入口も出していない）
  const now = Date.now()
  if (!canOpenShare(now, lastOpenedAt)) return
  lastOpenedAt = now
  try {
    Share.share(content).catch(() => undefined)
  } catch {
    // 同期で投げる実装でも画面を止めない
  }
}
