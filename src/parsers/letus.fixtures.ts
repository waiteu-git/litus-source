/**
 * LETUS（Moodle）課題/小テストページの実測に基づくHTMLフィクスチャ。
 * セッショントークンは含まない。htmlToPlainText を通した後のテキストで各パーサーを検証する。
 */

/** 課題（assign）・未提出・提出期限あり（未来） */
export const ASSIGN_NOT_SUBMITTED = `
<div class="assign">
  <table class="generaltable"><tbody>
    <tr><th>提出ステータス</th><td>未提出</td></tr>
    <tr><th>評価ステータス</th><td>評価なし</td></tr>
    <tr><th>提出期限</th><td>2026年 7月 15日(水曜日) 23:59</td></tr>
    <tr><th>残り時間</th><td>10日</td></tr>
  </tbody></table>
</div>`

/** 課題（assign）・提出済み */
export const ASSIGN_SUBMITTED = `
<div class="assign">
  <table class="generaltable"><tbody>
    <tr><th>提出ステータス</th><td>提出済み - 評価待ち</td></tr>
    <tr><th>提出期限</th><td>2026年 7月 15日(水曜日) 23:59</td></tr>
  </tbody></table>
</div>`

/** 課題（assign）・提出期限が過去 */
export const ASSIGN_PASSED = `
<div class="assign">
  <table class="generaltable"><tbody>
    <tr><th>提出ステータス</th><td>未提出</td></tr>
    <tr><th>提出期限</th><td>2020年 1月 10日(金曜日) 23:59</td></tr>
  </tbody></table>
</div>`

/** 課題（assign）・年なしの提出期限（当年扱い） */
export const ASSIGN_NO_YEAR = `
<div class="assign">
  <table class="generaltable"><tbody>
    <tr><th>提出ステータス</th><td>未提出</td></tr>
    <tr><th>提出期限</th><td>7月 15日 23:59</td></tr>
  </tbody></table>
</div>`

/** 課題（assign）・開始前（利用できません＋開始予定） */
export const ASSIGN_BEFORE_START = `
<div class="assign">
  <div class="alert">この課題はまだ利用できません</div>
  <table class="generaltable"><tbody>
    <tr><th>開始予定</th><td>2026年 8月 1日(土曜日) 00:00</td></tr>
  </tbody></table>
</div>`

/** 課題（assign）・締切キーワードなし・開始情報のみ（deadline=null, active） */
export const ASSIGN_START_ONLY = `
<div class="assign">
  <table class="generaltable"><tbody>
    <tr><th>公開日時</th><td>2026年 7月 1日(火曜日) 09:00</td></tr>
  </tbody></table>
</div>`

/** 小テスト（quiz）・受験終了（completed） */
export const QUIZ_FINISHED = `
<div class="quizinfo">
  <table class="generaltable"><tbody>
    <tr><th>ステータス</th><td>終了</td></tr>
    <tr><th>受験終了</th><td>2026年 7月 10日(金曜日) 17:50</td></tr>
  </tbody></table>
</div>`

/** 小テスト（quiz）・未受験（not_submitted） */
export const QUIZ_NOT_ATTEMPTED = `
<div class="quizinfo">
  <div class="box">この小テストはまだ受験していません（未受験）</div>
  <table class="generaltable"><tbody>
    <tr><th>受験終了</th><td>2026年 7月 20日(月曜日) 23:59</td></tr>
  </tbody></table>
</div>`

/** htmlToPlainText 検証用: script除去・エンティティ復号・br/pの改行化 */
export const HTML_NOISE = `<p>A&amp;B</p><br><script>evil("&lt;x&gt;")</script><span>C</span>`
