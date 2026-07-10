import { parse, type HTMLElement } from 'node-html-parser'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'

/** CLASS掲示一覧の1行（dl.keiji）から抽出した生データ。 */
export type BulletinRow = {
  category: string
  title: string
  date: string // 'YYYY/MM/DD'（掲示開始日）
  unread: boolean // タイトルリンクが太字(fontBold)＝未読
  flagged: boolean // 行のフラグボタン文言が「フラグをはずす」＝フラグ済み
  important: boolean // 重要アイコン(exclamation)が表示（hiddenStyleでない）
  isNew: boolean // 新着アイコン(lightbulb)が表示（hiddenStyleでない）
}

function hasClass(el: { getAttribute(name: string): string | undefined } | null, name: string): boolean {
  if (!el) return false
  return (el.getAttribute('class') ?? '').split(/\s+/).includes(name)
}

function iconVisible(dl: ReturnType<typeof parse>, faClass: string): boolean {
  const icon = dl.querySelector(`i.${faClass}`)
  if (!icon) return false
  // hiddenStyle クラスが付いていれば非表示（＝該当しない）。
  return !(icon.getAttribute('class') ?? '').split(/\s+/).includes('hiddenStyle')
}

/**
 * 掲示行のフラグ状態。行(dl.keiji)の親要素(div.alignRight)内のボタン文言で判定する。
 * PrimeFacesの ui-state-active / checked は状態が反転して紛らわしいため、文言で見る。
 * ボタンが無い旧フィクスチャ（dl のみ連結）では false になる。
 */
function rowFlagged(dl: HTMLElement): boolean {
  const parent = dl.parentNode
  if (!parent) return false
  const texts = parent.querySelectorAll('.ui-button-text')
  return texts.some((t) => (t.text ?? '').replace(/\s+/g, '') === 'フラグをはずす')
}

/**
 * COLLECT_BULLETIN_TABS_JS が送る「div.alignRight（dl.keiji＋状態ボタン）を連結したHTML」から
 * 掲示一覧を抽出する（純粋・RN非依存）。各行は category / title(a.ui-commandlink) / 末尾の日付テキスト /
 * 重要・新着アイコン / 未読(タイトルの fontBold) / フラグ(ボタン文言) を自己完結して持つ。
 * ボタンの無い旧「dl.keiji 連結」HTMLでも動作する（flagged は false）。
 */
export function parseBulletinList(html: string): BulletinRow[] {
  const root = parse(html)
  const out: BulletinRow[] = []
  for (const dl of root.querySelectorAll('dl.keiji')) {
    const a = dl.querySelector('a.ui-commandlink')
    if (!a) continue
    const title = (a.text ?? '').replace(/\s+/g, ' ').trim()
    if (!title) continue
    const category = (dl.querySelector('.keijiCategory')?.text ?? '').replace(/\s+/g, ' ').trim()
    const dates = (dl.text ?? '').match(/\d{4}\/\d{1,2}\/\d{1,2}/g)
    const date = dates ? dates[dates.length - 1] : ''
    out.push({
      category,
      title,
      date,
      unread: hasClass(a, 'fontBold'),
      flagged: rowFlagged(dl),
      important: iconVisible(dl, 'fa-exclamation-circle'),
      isNew: iconVisible(dl, 'fa-lightbulb-o'),
    })
  }
  return out
}

/** 「お知らせ(個人に対する)」等の括弧補足を落として短いカテゴリ名にする。 */
export function simplifyCategory(category: string): string {
  return category.replace(/[（(].*$/, '').trim() || category
}

/** 'YYYY/MM/DD' → 'M/D'（表示用）。解釈できなければ原文。 */
export function shortDate(date: string): string {
  const m = date.match(/^\d{4}\/(\d{1,2})\/(\d{1,2})$/)
  return m ? `${Number(m[1])}/${Number(m[2])}` : date
}

/**
 * 一覧行 → インフォタブ「CLASS掲示」の未読ダイジェスト。未読のみを新しい順（渡された順を維持）で。
 * id は JSF の要素IDが毎回変わるため、日付＋件名から安定生成する。
 */
export function toBulletinDigest(rows: BulletinRow[]): Pick<BulletinItem, 'id' | 'category' | 'title' | 'meta'>[] {
  return rows
    .filter((r) => r.unread)
    .map((r) => ({
      id: `${r.date}::${r.title}`,
      category: simplifyCategory(r.category),
      title: r.title,
      meta: [shortDate(r.date), r.important ? '重要' : ''].filter(Boolean).join(' ・ '),
    }))
}

/**
 * 一覧行 → 保存用 BulletinItem[]（全件・未読/フラグ状態込み・body は null）。
 * 画面側で unread / flagged によりセクション振り分けする。
 */
export function toBulletinItems(rows: BulletinRow[]): BulletinItem[] {
  return rows.map((r) => ({
    id: `${r.date}::${r.title}`,
    category: simplifyCategory(r.category),
    title: r.title,
    date: r.date,
    meta: [shortDate(r.date), r.important ? '重要' : ''].filter(Boolean).join(' ・ '),
    unread: r.unread,
    flagged: r.flagged,
    important: r.important,
    body: null,
  }))
}
