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
