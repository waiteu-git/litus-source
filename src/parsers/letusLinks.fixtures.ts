/**
 * LETUSコースページのリンク検出用フィクスチャ。
 * baseUrl は https://letus.ed.tus.ac.jp/course/view.php?id=5 を想定。
 */

export const COURSE_BASE_URL = 'https://letus.ed.tus.ac.jp/course/view.php?id=5'

/** extractLinksFromHtml 単体検証: 絶対URL化・フラグメント除去・空タイトル/画像のみは除外 */
export const LINKS_HTML = `
<ul>
  <li><a href="/mod/assign/view.php?id=101#intro">レポート課題1</a></li>
  <li><a href="/mod/quiz/view.php?id=102">第1回小テスト</a></li>
  <li><a href="/mod/resource/view.php?id=200"><img src="pdf.png"></a></li>
  <li><a href="/mod/page/view.php?id=201">   </a></li>
</ul>`

/**
 * コースページ本文。standard=課題+小テストのみ、broad=フォーラム+キーワードリンクも拾う。
 * 課題リンクは重複（#付き別タイトル）を含み、URL正規化後の重複排除を検証する。
 */
export const COURSE_PAGE = `
<div class="course-content">
  <a href="/course/view.php?id=5">コースホーム</a>
  <a href="/grade/report/user/index.php?id=5">成績</a>
  <a href="/mod/assign/view.php?id=101">レポート課題1</a>
  <a href="/mod/quiz/view.php?id=102">第1回小テスト</a>
  <a href="/mod/resource/view.php?id=103">講義スライド</a>
  <a href="/mod/forum/view.php?id=104">お知らせフォーラム</a>
  <a href="/mod/portfolio/view.php?id=106">レポート提出フォーム</a>
  <a href="/mod/assign/view.php?id=101#section-2">レポート課題1（再掲）</a>
</div>`
