/**
 * 画面ごとの軽量ヒントカード（チュートリアル）の定義と表示判定（純粋・RN非依存）。
 * 各主要タブ/画面を初めて開いたときに1枚だけ出し、×で二度と出ない（dismissed に永続）。
 * ジェスチャ系の操作（スワイプ非表示・曜日スワイプ等）は各画面の文面に畳み込む方針
 * （ユーザー確定 2026-07-14: 軽量ヒントカード×主要タブ＋隣接操作のヒント）。
 * 設定「ヒントを再表示」で dismissed をクリアすると全画面で再び表示される。
 */

export type HintKey = 'home' | 'timetable' | 'assignments' | 'attendance' | 'bulletins'

export type Hint = { title: string; body: string }

export const HINTS: Record<HintKey, Hint> = {
  home: {
    title: 'ホームのヒント',
    body: '上の「同期」でCLASS掲示→LETUS課題をまとめて更新できます。カードの並び替えと表示は設定の「ホームの並び」から変えられます。',
  },
  timetable: {
    title: '時間割のヒント',
    body: 'リスト表示では左右スワイプで曜日を移動できます。科目をタップすると出欠カウンタ・各回の予定・LETUSコースへの導線があります。',
  },
  assignments: {
    title: '課題のヒント',
    body: '課題は左スワイプで非表示にできます。期限切れは折りたたまれています。「コース」から時間割に無いLETUSコースの課題も追跡できます。',
  },
  attendance: {
    title: '出席のヒント',
    body: '授業中は受付状況を自動で確認します。学外ネットワークのときは警告が出ます（出席登録は学内Wi-Fi推奨）。',
  },
  bulletins: {
    title: '掲示のヒント',
    body: '掲示はタップで本文をアプリ内に表示し、自動で既読になります。重要な掲示はフラグで整理できます。',
  },
}

/** その画面で出すべきヒント。閉じられていれば null。 */
export function visibleHint(key: HintKey, dismissed: readonly string[]): Hint | null {
  return dismissed.includes(key) ? null : HINTS[key]
}

/** ヒントを閉じた状態を返す（重複追加しない・新配列）。 */
export function dismissHint(dismissed: readonly string[], key: HintKey): string[] {
  return dismissed.includes(key) ? [...dismissed] : [...dismissed, key]
}
