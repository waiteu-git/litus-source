import { parse } from 'node-html-parser'
import { richHtmlToText } from './text'

export type LetusAttachment = { name: string; url: string }
export type AssignBody = { description: string; attachments: LetusAttachment[] }

/**
 * LETUS課題ページ(mod/assign/view.php)のHTMLから説明本文と添付を抽出する純粋パーサ。
 * 締切・提出状況は parseAssignmentPage(letus.ts) の担当。ここは本文・添付に限定する。
 * intro が見つからなければ description='' を返し、画面側でWebViewフォールバックさせる。
 *
 * **same-host フィルタ**: 添付URLはタップで Cookie共有WebView に開かれるため、本文HTMLに
 * 書ける者（教員権限・LETUS側のXSS）が `https://外部/pluginfile.php/…` を仕込むと、任意ホストへ
 * Cookieつきでアクセスさせられうる。baseUrl（取得元ページ）と同一ホストの http(s) だけを残して
 * これを塞ぐ（`extractLinksFromHtml` と同じ方針・監査L-1）。
 *
 * baseUrl は**必須**にしてある。省略可にすると渡し忘れが「添付が黙って消える」or
 * 「検証されないまま通る」という実行時の挙動になるが、必須なら型エラーで全呼び出し元が炙り出せる。
 * baseUrl が解釈不能なら添付は空（fail-closed）。基準が無い状態で検証はできないため。
 */
export function parseAssignBody(html: string, baseUrl: string): AssignBody {
  const root = parse(html)
  // 実LETUS(Moodle 4.x / LETUS 2026): 本文 #intro/.activity-description は #region-main 直下にあり、
  // [role="main"] は送信ボタン等を含む内側の別divで #intro を子に持たない。v76 は [role="main"] を
  // 先に選び main.querySelector('#intro') がスコープ外で null になり全件「本文なし」になっていた。
  // → #region-main を最優先にする。無い旧レイアウトのみ [role="main"] にフォールバックする。
  const main =
    root.querySelector('#region-main') ??
    root.querySelector('#page-content') ??
    root.querySelector('[role="main"]') ??
    root

  // 注: [data-region="activity-information"] は本文候補に含めない。Moodle 4.x 標準の活動日程
  // 表示（開始日時/期限テキスト）のコンテナで、有効化されると日程が本文として誤保存されるため。
  const introEl =
    main.querySelector('#intro') ??
    main.querySelector('.activity-description') ??
    main.querySelector('.box.generalbox')
  // 本文テキストは .no-overflow（本文ラッパ）を優先し、添付ファイルツリー(assign_files_tree)の
  // ファイル名が本文へ混入するのを避ける。.no-overflow が無い旧構成は intro 全体から抽出する。
  // richHtmlToText は行末の空白しか畳まないため、Moodle側のpretty-print由来の
  // 行頭インデントを追加で除去する（改行構造自体はrichHtmlToTextの結果を尊重）。
  const textEl = introEl?.querySelector('.no-overflow') ?? introEl
  const description = textEl
    ? richHtmlToText(textEl.innerHTML)
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .trim()
    : ''

  // 添付は課題本文の introattachment のみ＝ intro スコープ内の pluginfile を対象にする。
  // 学生の提出ファイル(assignsubmission_file)は intro の外（提出状況テーブル）にあり自然に除外される。
  const attachments: LetusAttachment[] = []
  const seen = new Set<string>()
  const attachScope = introEl ?? main
  let baseHost: string
  try {
    baseHost = new URL(baseUrl).host
  } catch {
    return { description, attachments }
  }
  if (!baseHost) return { description, attachments }
  for (const a of attachScope.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? ''
    if (!/\/pluginfile\.php\//i.test(href)) continue
    // 相対URLもここで絶対化して検証する（画面側はこのURLをそのまま開く）。
    let abs: URL
    try {
      abs = new URL(href, baseUrl)
    } catch {
      continue
    }
    if (abs.protocol !== 'https:' && abs.protocol !== 'http:') continue
    if (abs.host !== baseHost) continue
    if (seen.has(href)) continue
    seen.add(href)
    const text = (a.text ?? '').replace(/\s+/g, ' ').trim()
    let name = text
    if (!name) {
      const last = href.split('/').pop() ?? ''
      name = decodeURIComponent(last.split('?')[0]) || 'ファイル'
    }
    attachments.push({ name, url: href })
  }

  return { description, attachments }
}
