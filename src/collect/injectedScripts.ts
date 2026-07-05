/** デスクトップChromeのUA（CLASSをPC版DOMで開かせる） */
export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** 現在表示中ページから時間割テーブルと時限時刻テキストを抽出して postMessage する（抽出のみ） */
export const EXTRACT_TIMETABLE_JS = `(function(){
  try {
    var table = document.querySelector('table.classTable');
    var jigen = document.querySelector('dd.jigenArea');
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'timetable',
      table: table ? table.outerHTML : '',
      jigen: jigen ? jigen.textContent : ''
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`
