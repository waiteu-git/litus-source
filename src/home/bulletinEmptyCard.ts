/**
 * ホームのCLASS掲示カード（未読0件時）の表示分岐（純ロジック・RN非依存）。
 *
 * 「未読0件」には2つの状態がある:
 * - collected=false: まだ一度も取得できていない → タップで取得を促す
 * - collected=true : 取得済みだが新着・未読なし → 「未読なし」を明示し、一覧への導線を残す
 *   （既読・フラグ付き・授業（休講/補講/教室変更）の掲示は未読0件でも一覧から見られる）
 */
export type BulletinEmptyCard = {
  text: string
  /** カードタップ時の挙動。list=掲示一覧を開く / sync=取得を開始 */
  action: 'list' | 'sync'
  /** 一覧への導線「すべて見る」を表示するか */
  showAllLink: boolean
}

export function bulletinEmptyCard({
  syncing,
  running,
  collected,
}: {
  /** 掲示の裏取得が進行中か */
  syncing: boolean
  /** 授業時間帯（出席優先で掲示取得を控える）か */
  running: boolean
  /** 一度でも掲示を取得できているか（最終更新あり or 保存済み掲示あり） */
  collected: boolean
}): BulletinEmptyCard {
  const text = syncing
    ? '掲示を取得しています…'
    : collected
      ? '新着・未読の掲示はありません'
      : running
        ? // 授業中はCLASS取得を既定で控えるが、タップすれば確認のうえ実行できる（[[decideClassSync]]）。
          // 「授業後に取得できます」と断言すると、同じタップで出る確認ダイアログと矛盾する。
          '授業中のため控えています。タップすると確認のうえ取得できます。'
        : 'まだ取得できていません。タップで取得します。'
  return { text, action: collected ? 'list' : 'sync', showAllLink: collected }
}
