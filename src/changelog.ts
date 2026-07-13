/**
 * アプリの変更履歴（純データ・RN非依存）。バージョン同期（versionCode更新）のたびに
 * ユーザーに見える変化だけを要約してここへ追加する（CLAUDE.md参照）。
 */
export type ChangelogEntry = {
  build: number
  date: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    build: 69,
    date: '2026/07/12',
    items: [
      '掲示から休講・補講の候補を抽出し、時間割の候補として提示',
      '科目詳細画面をサマリ＋折りたたみ式に再設計',
      'LETUS課題の本文・添付ファイルをアプリ内で直接表示',
      'インフォ画面をキャンパス別に再編（長万部キャンパスを追加）',
      '個人の予定を時間割に登録できる機能を追加',
      '起動時間を短縮',
    ],
  },
  {
    build: 70,
    date: '2026/07/12',
    items: [
      '初回起動の案内スライドが再度アニメーションしてしまう不具合を修正',
      'LETUS課題本文が取得できないことがある問題を修正',
    ],
  },
  {
    build: 71,
    date: '2026/07/12',
    items: [
      '重要な掲示を既読にしても未読表示に戻ってしまう不具合を修正',
      '掲示カルーセルの表示切り替えが遅い問題を修正',
    ],
  },
  {
    build: 72,
    date: '2026/07/13',
    items: [
      'LETUS課題（配布資料など）の締切・提出状況を手動で編集できる機能を追加',
      '課題詳細画面でPDFをアプリ内プレビュー表示',
    ],
  },
  {
    build: 73,
    date: '2026/07/13',
    items: [
      'ダークモードの配色に対応',
      'Androidホーム画面ウィジェット（今日の時間割・次の授業・直近の課題）を追加',
      '出席受付が始まったタイミングで通知するように',
      'ホーム画面の設定導線を歯車アイコンに変更し、当日の予定をまとめて表示',
    ],
  },
  {
    build: 74,
    date: '2026/07/13',
    items: [
      '出席確認の送信中に進捗表示を追加（フリーズと誤認しにくく）',
      'ダークモードが端末設定に追従しない問題を修正',
    ],
  },
  {
    build: 75,
    date: '2026/07/13',
    items: [
      'アプリ全体のフォントをIBM Plex Sans JPに統一',
      'LETUS・出席の通信頻度を抑え、動作を安定化',
    ],
  },
  {
    build: 76,
    date: '2026/07/13',
    items: [
      'LETUS課題詳細が読み込めず失敗することがある問題を修正',
      '課題を追加した直後に画面が動かなくなる不具合を修正',
      '掲示のフラグ切り替えが反映されないことがある問題を修正',
      '設定画面・ホーム画面のバージョン表示が実際のビルドより古いまま止まって見える問題を修正',
    ],
  },
]

/** build番号の降順（新しい順）に並べ替える。 */
export function sortChangelogDesc(entries: ChangelogEntry[]): ChangelogEntry[] {
  return [...entries].sort((a, b) => b.build - a.build)
}

/** 新しい順に先頭 count 件を返す（count が件数を超える場合は全件）。 */
export function getRecentChangelog(entries: ChangelogEntry[], count: number): ChangelogEntry[] {
  return sortChangelogDesc(entries).slice(0, Math.max(0, count))
}
