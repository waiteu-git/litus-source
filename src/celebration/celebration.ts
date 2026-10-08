/**
 * お祝いデザインの純粋ロジックと文言の台帳（React Native 非依存・vitest で守る）。
 *
 * 催し: 2026-10-07、東京理科大学の硤合憲三名誉教授にノーベル化学賞が決まった（大学の公式発表）。
 * 設計: docs/design/2026-10-08-celebration-mode.md（本人承認 2026-10-08）。
 *
 * 要件
 * - 設定で元に戻せる。**更新後の初回起動は既定でオン**。
 * - 期間限定（2026 年内）。期限が来たら、**全員**通常の見た目に戻る。
 *
 * 保存は「未選択／オン／オフ」の三値。**未選択＝オン**と読むので、更新の検出も「最後に見たビルド」の
 * 保存も要らない（既存ユーザーも新規インストールも、キーが無ければ自動でオン）。
 * オフを選んだ人は、キーが残る限り次の更新でもオフのまま。
 * **期限（2026年内）が来たら、明示でオンにした人も含めて全員が通常に戻る**（期間限定が全員に効く。
 * 「明示オンは残る」にすると、すでにオンの状態で「オン」を押しただけの人にも期限が効かず、
 * 大学サイトへのリンク＝営利と判断されるサイトからのリンクを控えるよう求めるポリシーの対象になりうる状態が年を越えて残る）。
 *
 * 文言は権利と事実の取り決めに従う（celebration.test.ts が機械で守る）:
 * - 受賞者は氏名と肩書だけ。出身・卒業・数（「2人目」）は書かない（公式発表に記載が無い・受賞者は東京大学卒）。
 * - 「ノーベル」は「ノーベル化学賞」という事実の記述でだけ使う。機能名・ロゴ風にしない（財団の商標）。
 * - メダル・財団や大学のロゴ・写真は使わない。非公式であることを明記する。
 */

export type CelebrationChoice = 'on' | 'off' | null

/** この時刻（2027-01-01 00:00 JST＝2026-12-31 の終わり）を過ぎると、全員が通常に戻る。 */
export const CELEBRATION_END_MS = Date.parse('2027-01-01T00:00:00+09:00')

function withinPeriod(now: Date): boolean {
  return now.getTime() < CELEBRATION_END_MS
}

/** お祝いデザインを表示するか。期間内かつオフを選んでいない（未選択・オン）時だけ。期限後は全員 false。 */
export function isCelebrationActive(choice: CelebrationChoice, now: Date): boolean {
  return choice !== 'off' && withinPeriod(now)
}

/** 設定に切替の行を出すか。期間内だけ（オフの人がオンへ戻せるように）。期限後は何も表示されないので行も出さない。 */
export function isCelebrationRowVisible(now: Date): boolean {
  return withinPeriod(now)
}

/**
 * Provider が公開する状態。**保存値の読み込み前（ready=false）は「出さない」**
 * （未選択＝オンと読むので、読み込み前にオンとして描くと、オフの人に一瞬だけ出てしまう）。
 */
export function celebrationState(
  ready: boolean,
  choice: CelebrationChoice,
  now: Date,
): { active: boolean; rowVisible: boolean } {
  return {
    active: ready && isCelebrationActive(choice, now),
    rowVisible: ready && isCelebrationRowVisible(now),
  }
}

/** 大学の公式発表ページ（2026-10-07）。外部ブラウザで開く（アプリ内 WebView は大学のログインの Cookie を共有するので使わない）。 */
export const CELEBRATION_LINK_URL = 'https://www.tus.ac.jp/today/archive/20261007_3541.html'

export const CELEBRATION_COPY = {
  /** 起動画面（ロゴの上）。静止した2行。 */
  bootTitle: 'ノーベル化学賞　おめでとうございます',
  bootName: '硤合憲三 名誉教授',
  /** ホームの最上段のカード。 */
  // 改行は、氏名と祝意の切れ目（「、」の後）に入れる＝折り返しで「おめでと／うございます」と割れない。
  cardHeadline: '硤合憲三名誉教授、\nノーベル化学賞おめでとうございます',
  cardLinkLabel: '大学の発表ページを開く',
  cardLinkA11y: '大学の発表ページを開く。ブラウザで開きます',
  cardNote: 'リタスは東京理科大学の非公式アプリです',
  /** 設定 › 表示。機能名にノーベルや大学名を入れない。 */
  settingLabel: 'お祝いデザイン',
  settingNote:
    '東京理科大学の硤合憲三名誉教授のノーベル化学賞受賞を祝う表示です。起動画面とホームなどが変わります。リタスは東京理科大学の公式アプリではありません。',
} as const
