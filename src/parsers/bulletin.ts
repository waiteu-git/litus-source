import { parse } from 'node-html-parser'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'

/** CLASS掲示一覧の1行（dl.keiji）から抽出した生データ。 */
export type BulletinRow = {
  category: string
  title: string
  date: string // 'YYYY/MM/DD'（掲示開始日）
  unread: boolean // タイトルリンクが太字(fontBold)＝未読
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
 * COLLECT_BULLETIN_JS が送る「dl.keiji を連結したHTML」から掲示一覧を抽出する（純粋・RN非依存）。
 * 各 dl.keiji は category / title(a.ui-commandlink) / 末尾の日付テキスト / 重要・新着アイコン /
 * 未読フラグ(タイトルの fontBold) を自己完結して持つ。
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
export function toBulletinDigest(rows: BulletinRow[]): BulletinItem[] {
  return rows
    .filter((r) => r.unread)
    .map((r) => ({
      id: `${r.date}::${r.title}`,
      category: simplifyCategory(r.category),
      title: r.title,
      meta: [shortDate(r.date), r.important ? '重要' : ''].filter(Boolean).join(' ・ '),
    }))
}
