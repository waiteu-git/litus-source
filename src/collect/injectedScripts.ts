/** デスクトップChromeのUA（CLASSをPC版DOMで開かせる） */
export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * 現在表示中ページから全ての時間割テーブルと時限時刻テキストを抽出して postMessage する（抽出のみ）。
 * 学期「すべて」では前期・後期が別々の table.classTable として並ぶため querySelectorAll で全て取る。
 */
export const COLLECT_TIMETABLE_JS = `(function(){
  try {
    var tables = Array.prototype.slice
      .call(document.querySelectorAll('table.classTable'))
      .map(function(t){ return t.outerHTML; });
    var jigen = document.querySelector('dd.jigenArea');
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'timetable',
      tables: tables,
      jigen: jigen ? jigen.textContent : ''
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/**
 * トップ→メニュー『履修』→『学生時間割表』へ遷移する（JSF onclick を .click() 発火）。
 * リンクはテキスト一致で探索する。実DOMに合わせセレクタ調整が必要な場合がある（実機で確認）。
 */
export const OPEN_TIMETABLE_JS = `(function(){
  function clickByText(text){
    var els = Array.prototype.slice.call(document.querySelectorAll('a,button,span'));
    var el = els.find(function(e){ return (e.textContent || '').trim().indexOf(text) >= 0; });
    if (el) { el.click(); return true; }
    return false;
  }
  try {
    if (!clickByText('学生時間割表')) {
      if (!clickByText('履修')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nav', ok: false, stage: 'menu' }));
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nav', ok: true, stage: 'menu-opened' }));
      }
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nav', ok: true, stage: 'timetable' }));
    }
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/**
 * モバイル出席登録ページ [Xua001] = xua001/Xua00101.xhtml（実測2026-07-06）。
 * 直リンクはセッション/ViewState無しで保証人ポータル等へ飛ぶため不可。到達はCLASSトップに
 * ログイン後、メニュー「出欠管理」→「モバイル出席登録」へ手動遷移する（.click()自動遷移は
 * 不安定なため採用しない）。**PC-UA(DESKTOP_UA)でのPCログインが安定**（実測確認）。当該授業
 * 時間中はこのページに受付中科目が表示され、認証コード入力もここで行う（軽量案）。
 */
export const ATTENDANCE_URL = 'https://class.admin.tus.ac.jp/uprx/up/xu/xua001/Xua00101.xhtml'

/**
 * CLASSトップから「出欠管理」→「モバイル出席登録」へ遷移する（JSFメニューを .click() 駆動）。
 * リンクはテキスト一致で探索。親メニューを開いてから子を押す2段階（実DOMで要微調整）。
 */
export const OPEN_ATTENDANCE_JS = `(function(){
  function findByText(text){
    var els = Array.prototype.slice.call(document.querySelectorAll('a,button,span,li'));
    return els.find(function(e){ return (e.textContent || '').trim().indexOf(text) >= 0; });
  }
  function clickText(text){ var el = findByText(text); if (el) { el.click(); return true; } return false; }
  try {
    if (clickText('モバイル出席登録')) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nav', ok: true, stage: 'attendance' }));
    } else if (clickText('出欠管理')) {
      setTimeout(function(){
        clickText('モバイル出席登録');
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nav', ok: true, stage: 'menu-opened' }));
      }, 400);
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nav', ok: false, stage: 'menu' }));
    }
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/**
 * 出席ページの受付状態テキストを抽出して postMessage する（抽出のみ）。
 * 受付なしのときは本文に「出席確認中の履修授業はありません」が含まれる。
 * 受付中科目名の厳密なセレクタは実DOMで確認して調整する（まずは本文innerTextで判定可能）。
 */
export const DETECT_ATTENDANCE_JS = `(function(){
  try {
    var body = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    var courseName = '';
    var m = body.match(/\\d{1,2}:\\d{2}\\s*[～~]\\s*\\d{1,2}:\\d{2}\\s+([^\\n]{2,40})/);
    if (m) courseName = m[1].trim();
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'attendance',
      text: body,
      courseName: courseName
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/**
 * 認証コードをCLASSの出席登録フォームに流し込み「出席登録する」を押す（独自UI入力用）。
 * 認証コード欄の実DOMが未確定のためベストエフォート: 「認証コード」ラベル以降の可視入力を候補にし、
 * 複数なら1〜2文字幅の箱に1文字ずつ、単一なら全体を流す。結果を診断付き(inputIds等)でpostMessageする。
 */
export function buildSubmitAttendanceJs(code: string): string {
  const c = JSON.stringify(String(code))
  return `(function(){
  try {
    var code = ${c};
    var all = Array.prototype.slice.call(document.querySelectorAll('input'));
    var inputs = all.filter(function(el){
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if (['hidden','submit','button','checkbox','radio','file','image','reset'].indexOf(t) >= 0) return false;
      if (el.disabled || el.readOnly || !el.offsetParent) return false;
      return true;
    });
    var labelEl = Array.prototype.slice.call(document.querySelectorAll('*')).find(function(e){
      return e.children.length === 0 && (e.textContent || '').indexOf('認証コード') >= 0;
    });
    var codeInputs = inputs;
    if (labelEl) {
      var after = inputs.filter(function(el){ return (labelEl.compareDocumentPosition(el) & 4) !== 0; });
      if (after.length > 0) codeInputs = after;
    }
    if (codeInputs.length > 1) {
      var small = codeInputs.filter(function(el){ return el.maxLength === 1 || el.maxLength === 2; });
      if (small.length > 0) codeInputs = small;
    }
    function nativeSet(el, v){
      try {
        var d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (d && d.set) { d.set.call(el, v); return; }
      } catch (e) {}
      el.value = v;
    }
    function setVal(el, v){
      el.focus();
      nativeSet(el, v);
      el.dispatchEvent(new KeyboardEvent('keydown', { key: v, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: v, bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: v, bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    }
    var filled = 0;
    if (codeInputs.length <= 1) {
      if (codeInputs[0]) { setVal(codeInputs[0], code); filled = 1; }
    } else {
      for (var i = 0; i < codeInputs.length && i < code.length; i++) { setVal(codeInputs[i], code.charAt(i)); filled++; }
    }
    var ids = codeInputs.map(function(el){ return el.id || el.name || '(no-id)'; });
    setTimeout(function(){
      var values = codeInputs.map(function(el){ return el.value; });
      var btns = Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],a,span'));
      var submitBtn = btns.find(function(b){ return ((b.textContent || b.value) || '').indexOf('出席登録') >= 0; });
      var clicked = false;
      if (submitBtn) { submitBtn.click(); clicked = true; }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'submit', inputCount: codeInputs.length, inputIds: ids, values: values, filled: filled, clicked: clicked
      }));
    }, 450);
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`
}

/** LETUSマイコース。全履修コースの名前(コード入り)＋course/view.php URL が並ぶ。 */
export const MYCOURSES_URL = 'https://letus.ed.tus.ac.jp/my/courses.php'

/** マイコース本文HTMLを抽出して postMessage（抽出のみ）。 */
export const COLLECT_MYCOURSES_JS = `(function(){
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'mycourses',
      html: document.body ? document.body.innerHTML : '',
      origin: location.origin
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/** コースページ本文HTMLを抽出して postMessage（抽出のみ）。 */
export const COLLECT_COURSE_PAGE_JS = `(function(){
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'coursepage',
      html: document.body ? document.body.innerHTML : '',
      origin: location.origin,
      url: location.href
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`
