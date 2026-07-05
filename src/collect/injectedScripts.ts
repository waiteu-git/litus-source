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
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'attendance',
      text: body,
      courseName: ''
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`
