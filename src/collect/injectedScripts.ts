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
 * トップ→メニュー『履修』→『学生時間割表』へ遷移する。
 * OPEN_ATTENDANCE_JS と同型: 旧実装のテキスト探索は外側要素（ハンドラ無し）を掴んで無反応に
 * なるため、**a要素のみ**を対象にメニューアンカーを掴み、onclick属性を new Function で直接
 * 実行する（無ければ .click() フォールバック）。
 */
export const OPEN_TIMETABLE_JS = `(function(){
  function post(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function findAnchor(text){
    var as = Array.prototype.slice.call(document.querySelectorAll('a'));
    var hits = as.filter(function(a){ return ((a.textContent || '').replace(/\\s+/g, '')).indexOf(text) >= 0; });
    var menu = hits.filter(function(a){ var idn = (a.id || a.name || ''); return idn.indexOf('menuForm') >= 0 || idn.indexOf('mainMenu') >= 0; });
    return (menu.length ? menu : hits)[0] || null;
  }
  function fire(el){
    var oc = el.getAttribute('onclick');
    try {
      if (oc) { new Function('event', oc).call(el, new MouseEvent('click', { bubbles: true })); return 'onclick'; }
      el.click(); return 'click';
    } catch (e) {
      try { el.click(); return 'click-fb'; } catch (e2) { return 'err'; }
    }
  }
  try {
    var target = findAnchor('学生時間割表');
    if (target) {
      var m = fire(target);
      post({ type: 'nav', ok: m !== 'err', stage: 'timetable-click', method: m, id: target.id || '' });
    } else {
      var parent = findAnchor('履修');
      if (parent) {
        var m2 = fire(parent);
        post({ type: 'nav', ok: m2 !== 'err', stage: 'menu-opened', method: m2, id: parent.id || '' });
        setTimeout(function(){
          var t2 = findAnchor('学生時間割表');
          if (t2) { var m3 = fire(t2); post({ type: 'nav', ok: m3 !== 'err', stage: 'timetable-click', method: m3, id: t2.id || '' }); }
          else { post({ type: 'nav', ok: false, stage: 'submenu' }); }
        }, 500);
      } else {
        post({ type: 'nav', ok: false, stage: 'menu' });
      }
    }
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/**
 * モバイル出席登録ページ [Xua001] = xua001/Xua00101.xhtml（実測2026-07-06）。
 * 直リンクはセッション/ViewState無しで保証人ポータル等へ飛ぶため不可。到達はCLASSトップに
 * ログイン後、メニュー「出欠管理」→「モバイル出席登録」を OPEN_ATTENDANCE_JS で自動遷移する
 * （旧実装の .click() が不安定だった真因は外側 <li> を掴む誤要素クリック。a要素＋onclick直接実行に修正）。
 * **PC-UA(DESKTOP_UA)でのPCログインが安定**（実測確認）。当該授業時間中はこのページに受付中科目が
 * 表示され、認証コード入力もここで行う（軽量案）。
 */
export const ATTENDANCE_URL = 'https://class.admin.tus.ac.jp/uprx/up/xu/xua001/Xua00101.xhtml'

/**
 * CLASSトップから「出欠管理」→「モバイル出席登録」へ遷移する。
 * 旧実装は a,button,span,li を文書順テキスト探索していたため、ハンドラを持たない外側の <li>（PrimeFaces
 * メニューは <li><a><span>ラベル</span></a></li>）を掴んで無反応クリックになっていた（出席送信ボタンの
 * 「間違った要素」バグと同型）。**a 要素のみ**を対象にメニューアンカーを掴み、onclick属性を new Function で
 * 直接実行する（送信ボタンで実証済みのJSF発火パターン。無ければ .click() フォールバック）。
 */
export const OPEN_ATTENDANCE_JS = `(function(){
  function post(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function findAnchor(text){
    var as = Array.prototype.slice.call(document.querySelectorAll('a'));
    var hits = as.filter(function(a){ return ((a.textContent || '').replace(/\\s+/g, '')).indexOf(text) >= 0; });
    // メニュー本体(menuForm/mainMenu)のアンカーを優先（他所の同名テキスト対策）
    var menu = hits.filter(function(a){ var idn = (a.id || a.name || ''); return idn.indexOf('menuForm') >= 0 || idn.indexOf('mainMenu') >= 0; });
    return (menu.length ? menu : hits)[0] || null;
  }
  function fire(el){
    var oc = el.getAttribute('onclick');
    try {
      if (oc) { new Function('event', oc).call(el, new MouseEvent('click', { bubbles: true })); return 'onclick'; }
      el.click(); return 'click';
    } catch (e) {
      try { el.click(); return 'click-fb'; } catch (e2) { return 'err'; }
    }
  }
  try {
    var target = findAnchor('モバイル出席登録');
    if (target) {
      var m = fire(target);
      post({ type: 'nav', ok: m !== 'err', stage: 'attendance-click', method: m, id: target.id || '' });
    } else {
      var parent = findAnchor('出欠管理');
      if (parent) {
        var m2 = fire(parent);
        post({ type: 'nav', ok: m2 !== 'err', stage: 'menu-opened', method: m2, id: parent.id || '' });
        setTimeout(function(){
          var t2 = findAnchor('モバイル出席登録');
          if (t2) { var m3 = fire(t2); post({ type: 'nav', ok: m3 !== 'err', stage: 'attendance-click', method: m3, id: t2.id || '' }); }
          else { post({ type: 'nav', ok: false, stage: 'submenu' }); }
        }, 500);
      } else {
        post({ type: 'nav', ok: false, stage: 'menu' });
      }
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
 * 入口スプラッシュのPC ENTER先（実DOM確認 2026-07-07: 静的HTMLの素の <a href>。PC幅は「ENTER」1個、
 * モバイル幅は「スマートフォン ENTER」「PC ENTER」の2個で、PC側は同じこのURL）。
 */
export const CLASS_PC_LOGIN_URL = 'https://class.admin.tus.ac.jp/uprx/ShibbolethAuthServlet'

/**
 * CLASSの入口スプラッシュ（CLASSロゴ＋「スマートフォン ENTER」「PC ENTER」）からPC側で自動入場する
 * （DESKTOP_UA＝PCログインが安定なのでPC側を選ぶ）。スプラッシュは静的HTMLでPC ENTERは素の <a href> のため、
 * クリック合成ではなく **href（無ければ既知URL）への location.replace** で確実に遷移する。
 * スプラッシュ以外（ENTERアンカー無し）では no-op なので各ページ読込時に流してよい。
 */
export const ENTER_CLASS_PC_JS = `(function(){
  try {
    var els = Array.prototype.slice.call(document.querySelectorAll('a'));
    var btn = els.find(function(e){
      var t = (e.textContent || '').replace(/\\s+/g, '');
      return /ENTER/i.test(t) && (t.indexOf('PC') >= 0 || t.replace(/ENTER/i, '') === '');
    });
    if (btn) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nav', ok: true, stage: 'class-pc-enter' }));
      var href = btn.getAttribute('href');
      location.replace(href || ${JSON.stringify(CLASS_PC_LOGIN_URL)});
    }
  } catch (e) {}
  true;
})();`

/**
 * 認証コードをCLASSの出席登録フォームへ流し込み、独自UIのボタンだけで送信まで完結させる。
 * 流し込みは実キー入力風（ネイティブvalueセッター＋keydown/keypress/input/keyup、keyCode付与）で
 * ウィジェットにコミットさせる（単なる .value 代入だと空送信扱いになる、を実機で確認）。送信は合成
 * .click() が無視されるため、「出席登録する」ボタンの onclick 属性（PrimeFacesの本物のJSF送信呼び出し）を
 * new Function で直接実行する（無ければ .click() にフォールバック）。認証コード欄の実DOM未確定のため
 * ベストエフォート:「認証コード」ラベル以降の可視入力(1〜2文字箱)に1文字ずつ。結果を診断付き
 * (values/method/onclick)でpostMessage(type:'submit')。onclickが取れない/効かない場合は診断のonclickを
 * 見て正しい送信呼び出しを組む。
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
    function fireKey(el, type, ch){
      var e = new KeyboardEvent(type, { key: ch, bubbles: true, cancelable: true });
      try {
        Object.defineProperty(e, 'keyCode', { get: function(){ return ch.charCodeAt(0); } });
        Object.defineProperty(e, 'which', { get: function(){ return ch.charCodeAt(0); } });
      } catch (e2) {}
      el.dispatchEvent(e);
    }
    function setVal(el, v){
      el.focus();
      fireKey(el, 'keydown', v);
      fireKey(el, 'keypress', v);
      nativeSet(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      fireKey(el, 'keyup', v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var filled = 0;
    if (codeInputs.length <= 1) {
      if (codeInputs[0]) { setVal(codeInputs[0], code); filled = 1; }
    } else {
      for (var i = 0; i < codeInputs.length && i < code.length; i++) { setVal(codeInputs[i], code.charAt(i)); filled++; }
    }
    var ids = codeInputs.map(function(el){ return el.id || el.name || '(no-id)'; });
    // 流し込み確定後に「出席登録する」の onclick（confirmIfModified→PrimeFaces.confirm）を実行し、
    // 出てくる PrimeFaces 確認ダイアログの「はい」を自動クリックして送信を確定する。
    // window.confirm も一応 true に上書き（別経路の素の confirm 用・PrimeFaces.confirm には無効だが無害）。
    try { window.confirm = function(){ return true }; window.alert = function(){}; window.onbeforeunload = null; } catch (e0) {}
    setTimeout(function(){
      var values = codeInputs.map(function(el){ return el.value; });
      var els = Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],a'));
      // メニュー項目「モバイル出席登録」(menuForm:mainMenu)を除外し、フォームの「出席登録する」を掴む。
      function okBtn(b,needle){ var t=((b.textContent||b.value)||'').replace(/\\s+/g,''); var idn=(b.id||b.name||''); if(idn.indexOf('menuForm')>=0||idn.indexOf('mainMenu')>=0)return false; return t.indexOf(needle)>=0; }
      var btn = els.find(function(b){return okBtn(b,'出席登録する');}) || els.find(function(b){return okBtn(b,'出席登録');});
      var method = 'none';
      var onclickStr = '';
      var confirmSrc = '';
      try {
        var cf = window.confirmIfModified || window.confirmIfModified4M;
        if (cf) confirmSrc = String(cf).replace(/\\s+/g, ' ').slice(0, 200);
      } catch (e1) {}
      if (btn) {
        var oc = btn.getAttribute('onclick');
        onclickStr = oc ? String(oc).slice(0, 300) : '';
        try {
          if (oc) { new Function('event', oc).call(btn, new MouseEvent('click', { bubbles: true })); method = 'onclick'; }
          else { btn.click(); method = 'click'; }
        } catch (err) {
          try { btn.click(); method = 'click-fb'; } catch (e2) { method = 'err'; }
        }
      }
      // 保険: 確認ダイアログが出る画面なら「はい」を自動クリック（この出席登録ボタンは onclick 直の
      // PrimeFaces.ab 送信で通常ダイアログ無し。念のため残す・無害）。
      setTimeout(function(){
        var yes = document.querySelector('.ui-confirmdialog-yes');
        if (!yes) {
          var dlgBtns = Array.prototype.slice.call(
            document.querySelectorAll('.ui-confirm-dialog button, .ui-confirmdialog button, .ui-dialog button, .ui-dialog a'),
          );
          yes = dlgBtns.filter(function(b){ return !!b.offsetParent; }).find(function(b){
            var t = ((b.textContent || b.value) || '').trim();
            return t === 'はい' || t === 'OK' || /^(yes|ok)$/i.test(t);
          });
        }
        if (yes) { try { var oc2 = yes.getAttribute('onclick'); if (oc2) { new Function('event', oc2).call(yes, new MouseEvent('click', { bubbles: true })); } else { yes.click(); } } catch (e3) { try { yes.click(); } catch (e4) {} } }
      }, 400);
      // 送信レスポンスを待って結果を判定して返す。
      setTimeout(function(){
        var body = document.body ? (document.body.innerText || '') : '';
        var wrong = /認証コードが違います|コードが違います/.test(body);
        var ok = /出席しました|登録しました|受付を完了|出席登録が完了|出席済/.test(body);
        var err = /システムエラー|エラーが発生|ViewExpired/.test(body);
        var result = !btn ? '「出席登録する」ボタンが見つかりません'
          : ok ? '出席登録しました'
          : wrong ? '認証コードが違います（コードを確認してください）'
          : err ? 'エラーが発生しました。「最初に戻る」で再試行してください'
          : '送信しました（下の画面で結果をご確認ください）';
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'submit', result: result, ok: ok, wrong: wrong, err: err, btnFound: !!btn,
          values: values, method: method, onclick: onclickStr
        }));
      }, 1600);
    }, 350);
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`
}

/** 実験ラボ用: 使える送信パターンの識別子。UIのボタンと1:1対応。 */
export type AttendanceStrategy =
  | 'onclick-yes'
  | 'click-yes'
  | 'events-yes'
  | 'ab-direct'
  | 'no-modified'
  | 'widget-form'
  | 'touch-click'
  | 'pfconfirm-cmd'

/**
 * 実験ラボ用: 認証コードを流し込み、指定の送信パターンで「出席登録する」を発火し、1.5秒後に結果を
 * スナップショットして postMessage(type:'lab') する。どのパターンで登録が通るかを実機で切り分けるための
 * 開発用。各パターンは buildSubmitAttendanceJs の知見（PrimeFaces.confirmの「はい」自動クリック等）を土台にする。
 */
export function buildAttendanceLabJs(code: string, strategy: string): string {
  const c = JSON.stringify(String(code))
  const s = JSON.stringify(String(strategy))
  return `(function(){
  try {
    var code = ${c}; var strategy = ${s};
    function post(o){ o.type='lab'; o.strategy=strategy; window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
    function nativeSet(el,v){ try{var d=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); if(d&&d.set){d.set.call(el,v);return;}}catch(e){} el.value=v; }
    function fireKey(el,type,ch){ var e=new KeyboardEvent(type,{key:ch,bubbles:true,cancelable:true}); try{Object.defineProperty(e,'keyCode',{get:function(){return ch.charCodeAt(0)}});Object.defineProperty(e,'which',{get:function(){return ch.charCodeAt(0)}});}catch(e2){} el.dispatchEvent(e); }
    function setVal(el,v){ el.focus(); fireKey(el,'keydown',v); fireKey(el,'keypress',v); nativeSet(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); fireKey(el,'keyup',v); el.dispatchEvent(new Event('change',{bubbles:true})); }
    function codeInputs(){
      var all=Array.prototype.slice.call(document.querySelectorAll('input')).filter(function(el){var t=(el.getAttribute('type')||'text').toLowerCase(); if(['hidden','submit','button','checkbox','radio','file','image','reset'].indexOf(t)>=0)return false; if(el.disabled||el.readOnly||!el.offsetParent)return false; return true;});
      var label=Array.prototype.slice.call(document.querySelectorAll('*')).find(function(e){return e.children.length===0&&(e.textContent||'').indexOf('認証コード')>=0;});
      var ins=all; if(label){var after=all.filter(function(el){return (label.compareDocumentPosition(el)&4)!==0;}); if(after.length>0)ins=after;}
      if(ins.length>1){var sm=ins.filter(function(el){return el.maxLength===1||el.maxLength===2;}); if(sm.length>0)ins=sm;}
      return ins;
    }
    var ins=codeInputs(); var filled=0;
    if(ins.length<=1){ if(ins[0]){setVal(ins[0],code);filled=1;} } else { for(var i=0;i<ins.length&&i<code.length;i++){setVal(ins[i],code.charAt(i));filled++;} }
    function findBtn(){
      var els=Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],a'));
      // メニュー項目「モバイル出席登録」(menuForm:mainMenu)ではなく、フォームの「出席登録する」を掴む。
      function ok(b,needle){ var t=((b.textContent||b.value)||'').replace(/\\s+/g,''); var idn=(b.id||b.name||''); if(idn.indexOf('menuForm')>=0||idn.indexOf('mainMenu')>=0)return false; return t.indexOf(needle)>=0; }
      return els.find(function(b){return ok(b,'出席登録する');}) || els.find(function(b){return ok(b,'出席登録');});
    }
    function clickYes(){ var y=document.querySelector('.ui-confirmdialog-yes'); if(!y){var bs=Array.prototype.slice.call(document.querySelectorAll('.ui-confirm-dialog button,.ui-confirmdialog button,.ui-dialog button,.ui-dialog a')); y=bs.filter(function(b){return !!b.offsetParent;}).find(function(b){var t=((b.textContent||b.value)||'').trim(); return t==='はい'||t==='OK'||/^(yes|ok)$/i.test(t);});} if(y){try{var oc=y.getAttribute('onclick'); if(oc){new Function('event',oc).call(y,new MouseEvent('click',{bubbles:true}));}else{y.click();} return true;}catch(e){try{y.click();return true;}catch(e2){}}} return false; }
    function snap(){
      var dlg=document.querySelector('.ui-confirmdialog'); var dialogOpen=!!(dlg&&dlg.offsetParent);
      var msg=''; Array.prototype.slice.call(document.querySelectorAll('.ui-growl-item,.ui-messages,.ui-message,.ui-growl')).forEach(function(m){var t=(m.innerText||m.textContent||'').replace(/\\s+/g,' ').trim(); if(t)msg+=t+' | ';});
      var body=(document.body?(document.body.innerText||''):'');
      var hasErr=/システムエラー|エラーが発生|ViewExpired|失敗しました/.test(body+' '+msg);
      var hasOk=/登録しました|出席しました|受付を完了|登録が完了|出席登録が完了/.test(body+' '+msg);
      var vals=ins.map(function(el){return el.value;}).join(',');
      var st=body.match(/出席確認中|出席済|未提出|受付中/);
      return {dialogOpen:dialogOpen,msg:msg.slice(0,160),hasErr:hasErr,hasOk:hasOk,vals:vals,status:st?st[0]:''};
    }
    var btn=findBtn(); var onclick=btn?String(btn.getAttribute('onclick')||'').slice(0,300):''; var method='none';
    setTimeout(function(){
      var xhrBefore=(window.__litusXhr?window.__litusXhr.length:0);
      try{
        if(strategy==='onclick-yes'){ if(btn){var a=btn.getAttribute('onclick'); if(a)new Function('event',a).call(btn,new MouseEvent('click',{bubbles:true})); else btn.click();} method='onclick'; setTimeout(clickYes,500); }
        else if(strategy==='click-yes'){ if(btn)btn.click(); method='click'; setTimeout(clickYes,500); }
        else if(strategy==='events-yes'){ if(btn){['pointerdown','mousedown','mouseup','click'].forEach(function(t){try{btn.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}));}catch(e){}});} method='events'; setTimeout(clickYes,500); }
        else if(strategy==='ab-direct'){ var m=onclick.match(/PrimeFaces\\.ab\\([\\s\\S]*\\)/); if(m){ try{ new Function(m[0]).call(btn); method='ab'; }catch(e){ method='ab-err:'+String(e).slice(0,40); } } else { method='ab-none(onclickにabなし)'; } }
        else if(strategy==='no-modified'){ try{window.isModified=function(){return false};}catch(e){} if(btn){var b2=btn.getAttribute('onclick'); if(b2)new Function('event',b2).call(btn,new MouseEvent('click',{bubbles:true})); else btn.click();} method='no-modified'; setTimeout(clickYes,500); }
        else if(strategy==='widget-form'){ var done=false; try{ if(btn&&btn.id&&window.PrimeFaces&&PrimeFaces.widgets){ for(var k in PrimeFaces.widgets){var w=PrimeFaces.widgets[k]; if(w&&w.id&&btn.id.indexOf(w.id)>=0&&w.jq){w.jq.trigger('click');done=true;break;}} } }catch(e){} if(!done){var f=btn&&btn.closest?btn.closest('form'):null; if(f){try{ if(f.requestSubmit)f.requestSubmit(); else f.submit(); done=true;}catch(e){}}} method=done?'widget-form':'widget-none(発火先なし)'; setTimeout(clickYes,500); }
        else if(strategy==='touch-click'){ if(btn){ try{btn.focus();}catch(e){} ['pointerover','pointerenter','pointerdown','pointerup','mouseover','mousedown','mouseup','click'].forEach(function(t){ try{ var Ctor=(t.indexOf('pointer')===0&&window.PointerEvent)?window.PointerEvent:window.MouseEvent; btn.dispatchEvent(new Ctor(t,{bubbles:true,cancelable:true,view:window})); }catch(e){ try{ btn.dispatchEvent(new MouseEvent(t.replace('pointer','mouse'),{bubbles:true,cancelable:true,view:window})); }catch(e2){} } }); try{ btn.dispatchEvent(new Event('touchstart',{bubbles:true,cancelable:true})); btn.dispatchEvent(new Event('touchend',{bubbles:true,cancelable:true})); }catch(e){} } method='touch'; setTimeout(clickYes,500); }
        else if(strategy==='pfconfirm-cmd'){ var cmd=btn?btn.getAttribute('data-pfconfirmcommand'):null; if(cmd){ try{ new Function('event', cmd).call(btn, (window.event||new MouseEvent('click',{bubbles:true}))); method='pfcmd'; }catch(e){ method='pfcmd-err:'+String(e).slice(0,50); } } else { method='pfcmd-none(data-pfconfirmcommand無し)'; } }
        else { method='unknown-strategy'; }
      }catch(err){ method='throw:'+String(err).slice(0,60); }
      setTimeout(function(){ var sp=snap(); var xf=(window.__litusXhr||[]).slice(xhrBefore); post({filled:filled,btnFound:!!btn,method:method,onclick:onclick,dialogOpen:sp.dialogOpen,msg:sp.msg,hasErr:sp.hasErr,hasOk:sp.hasOk,vals:sp.vals,status:sp.status,xhrFired:xf.length,xhrUrl:xf.length?xf[xf.length-1].url:''}); }, 1800);
    }, 300);
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'lab', strategy:strategy, method:'outer-throw:'+String(e).slice(0,80) }));
  }
  true;
})();`
}

/**
 * 実験ラボ用計器: XMLHttpRequest.send / fetch をフックし、送信されたリクエストを window.__litusXhr に記録する。
 * 各パターン実行で「送信AJAXが実際に飛んだか」を切り分けるため。ページ読込ごとに冪等に注入する。
 */
export const INSTALL_XHR_HOOK_JS = `(function(){
  if(window.__litusHooked) return true;
  window.__litusHooked = true; window.__litusXhr = [];
  try {
    var oO=XMLHttpRequest.prototype.open, oS=XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open=function(m,u){ this.__u=u; return oO.apply(this,arguments); };
    XMLHttpRequest.prototype.send=function(){ try{ window.__litusXhr.push({t:Date.now(),url:String(this.__u||'').slice(0,140)}); }catch(e){} return oS.apply(this,arguments); };
  } catch(e){}
  try { if(window.fetch){ var of=window.fetch; window.fetch=function(u){ try{ window.__litusXhr.push({t:Date.now(),url:String((u&&u.url)||u||'').slice(0,140)}); }catch(e){} return of.apply(this,arguments); }; } } catch(e){}
  return true;
})();`

/**
 * 実験ラボ用計器: 送信の真相を掴む深掘りダンプ。confirmIfModified/4M の全文（elseの本当の送信呼び出し）と、
 * 認証コード欄まわりの全input（隠しフィールド含む name/value/maxLength）を postMessage(type:'diag') する。
 */
export const DUMP_DIAG_JS = `(function(){
  try{
    function src(fn){ try{ return fn?String(fn).replace(/\\s+/g,' '):''; }catch(e){ return ''; } }
    var cim=src(window.confirmIfModified).slice(0,900);
    var cim4=src(window.confirmIfModified4M).slice(0,900);
    var label=Array.prototype.slice.call(document.querySelectorAll('*')).find(function(e){return e.children.length===0&&(e.textContent||'').indexOf('認証コード')>=0;});
    var all=Array.prototype.slice.call(document.querySelectorAll('input'));
    var near=all; if(label){ var af=all.filter(function(el){return (label.compareDocumentPosition(el)&4)!==0;}); if(af.length>0)near=af; }
    var inputs=near.slice(0,12).map(function(el){ return (el.getAttribute('type')||'text')+' '+(el.name||el.id||'?')+'="'+String(el.value||'').slice(0,10)+'" ml='+el.maxLength+(el.offsetParent?'':' [hidden]'); });
    var bs=Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],a'));
    function okB(b,needle){ var t=((b.textContent||b.value)||'').replace(/\\s+/g,''); var idn=(b.id||b.name||''); if(idn.indexOf('menuForm')>=0||idn.indexOf('mainMenu')>=0)return false; return t.indexOf(needle)>=0; }
    var btn=bs.find(function(b){return okB(b,'出席登録する');}) || bs.find(function(b){return okB(b,'出席登録');});
    var pfcmd=btn?String(btn.getAttribute('data-pfconfirmcommand')||'(なし)').slice(0,500):'(ボタン無し)';
    var bonclick=btn?String(btn.getAttribute('onclick')||'').slice(0,200):'';
    var btnId=btn?String(btn.id||btn.name||btn.tagName):'(ボタン無し)';
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'diag', cim:cim, cim4:cim4, inputs:inputs, pfcmd:pfcmd, bonclick:bonclick, btnId:btnId}));
  }catch(e){ window.ReactNativeWebView.postMessage(JSON.stringify({type:'diag', err:String(e).slice(0,140)})); }
  true;
})();`

/**
 * 現在ページのログイン状態シグナルを抽出して postMessage する（抽出のみ・classifyAuthState で判定）。
 * パスワード入力欄=ログイン要求、ログアウトリンク(ログアウト/logout)=ログイン済み。CLASS/LETUS 双方で成立。
 */
export const DETECT_AUTH_JS = `(function(){
  try {
    var hasPassword = !!document.querySelector('input[type=password]');
    var links = Array.prototype.slice.call(document.querySelectorAll('a,button,input[type=submit]'));
    var hasLogout = links.some(function(el){
      var t = ((el.textContent || el.value) || '');
      var href = (el.getAttribute && (el.getAttribute('href') || '')) || '';
      return t.indexOf('ログアウト') >= 0 || /logout|logoff|signout/i.test(t) || /logout|logoff|signout/i.test(href);
    });
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'auth', hasPasswordInput: hasPassword, hasLogoutLink: hasLogout, url: location.href
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/**
 * 非表示WebViewの現在ページ種別シグナルを抽出して postMessage する（抽出のみ・classifyClassPage で判定）。
 * パスワード欄=ログイン / 認証コード欄＋出席登録するボタン=出席フォーム / PC・スマホ ENTER=入口スプラッシュ /
 * 「出欠管理」メニュー=CLASSポータル。
 */
export const DETECT_PAGE_JS = `(function(){
  try {
    var body = document.body ? (document.body.innerText || '') : '';
    var hasPassword = !!document.querySelector('input[type=password]');
    var btns = Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],a'));
    function txt(e){ return ((e.textContent||e.value)||'').replace(/\\s+/g,''); }
    var hasSubmitBtn = btns.some(function(b){ var idn=(b.id||b.name||''); if(idn.indexOf('menuForm')>=0||idn.indexOf('mainMenu')>=0)return false; return txt(b).indexOf('出席登録する')>=0; });
    var hasAttendanceForm = hasSubmitBtn && body.indexOf('認証コード') >= 0;
    var hasEnterSplash = btns.some(function(b){ var t=txt(b); return t.indexOf('PC')>=0 && /ENTER/i.test(t); });
    var hasClassMenu = body.indexOf('出欠管理') >= 0;
    // ログアウトリンク=ログイン済みの普遍シグナル。ログイン後ポータルに「出欠管理」文字が
    // 無い画面でも authed と判定できるようにする（ログイン済みなのにログイン表示になる不具合対策）。
    var hasLogout = btns.some(function(b){
      var t = ((b.textContent||b.value)||'');
      var href = (b.getAttribute && (b.getAttribute('href')||'')) || '';
      return t.indexOf('ログアウト') >= 0 || /logout|logoff|signout/i.test(t) || /logout|logoff|signout/i.test(href);
    });
    var hasSystemError = /システムエラー|ViewExpired|この画面を閉じてください|別の画面で操作|複数の画面でご利用/.test(body);
    // 過去のリクエスト=SAMLリプレイ拒否 / CSRF=並走SSO等でフォームのトークンが無効化された状態。
    // どちらも「フローが壊れた」なので新しいWebViewでフォームを取り直す（gateのrecover対象）。
    var hasSsoStale = /過去のリクエスト|CSRF/i.test(body);
    // CLASSの定時メンテナンス（毎日2:00〜4:00）。この間はログインもできないので専用表示にする。
    var hasMaintenance = /システムメンテナンス|メンテナンス中|ただいまメンテナンス|ご利用いただけません/.test(body);
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'page', hasPasswordInput: hasPassword, hasAttendanceForm: hasAttendanceForm,
      hasEnterSplash: hasEnterSplash, hasClassMenu: hasClassMenu, hasLogout: hasLogout,
      hasSystemError: hasSystemError, hasSsoStale: hasSsoStale, hasMaintenance: hasMaintenance, url: location.href
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/** SSOセッションを黙って温める先読み対象（CLASS=出席/時間割、LETUS=課題）。 */
export const CLASS_TOP_URL = 'https://class.admin.tus.ac.jp/'

/**
 * CLASS掲示一覧を抽出。ログイン後ポータル(Xut12401)は左に機能メニュー、本文に掲示一覧(dl.keiji)を
 * 同居して表示する。各 dl.keiji は自己完結（カテゴリ/件名/日付/重要・新着アイコン/未読=fontBold）なので、
 * その outerHTML を連結して送る。掲示ページに居るか(onKeijiPage)も一緒に返し、誤クリアを防ぐ。
 */
export const COLLECT_BULLETIN_JS = `(function(){
  try {
    var dls = document.querySelectorAll('dl.keiji');
    var html = '';
    for (var i=0;i<dls.length;i++){ html += dls[i].outerHTML; }
    var body = document.body ? (document.body.innerText || '') : '';
    // 掲示タブUI（グループ/未読/新着…）か、カテゴリ見出しが有れば掲示ページとみなす。
    var onKeijiPage = dls.length > 0 || !!document.querySelector('.keijiCategory')
      || (/グループ/.test(body) && /未読/.test(body) && /新着/.test(body));
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'bulletin', html: '<div>' + html + '</div>', count: dls.length, onKeijiPage: onKeijiPage
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

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

/**
 * 単一の課題ページ本文HTML＋パンくずの科目名を抽出して postMessage（手動追加用）。
 * 科目名は Moodle パンくず（.breadcrumb 内の course/view.php リンク）から best-effort で取る。
 */
export const COLLECT_ASSIGNMENT_PAGE_JS = `(function(){
  try {
    var courseName = '';
    var crumbs = Array.prototype.slice.call(document.querySelectorAll('.breadcrumb a, nav[aria-label] a, #page-navbar a'));
    var courseLink = crumbs.filter(function(a){ return /\\/course\\/view\\.php/.test(a.getAttribute('href') || ''); }).pop();
    if (courseLink) courseName = (courseLink.textContent || '').trim();
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'assignmentpage',
      html: document.body ? document.body.innerHTML : '',
      url: location.href,
      courseName: courseName
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/** 課題らしいURLか（アプリ内ビューアで手動追加ボタンを出す判定に使う）。 */
export function isAssignmentPageUrl(url: string): boolean {
  return /\/mod\/(assign|quiz|turnitintool|turnitintooltwo|workshop|feedback|questionnaire)\/view\.php/i.test(url)
}

/** LETUSコースのトップページか（各アクティビティに追加ボタンを差す判定）。 */
export function isCoursePageUrl(url: string): boolean {
  return /\/course\/view\.php/i.test(url)
}

/**
 * タップで即ダウンロードが始まってしまうファイル系URLか（PDF等）。押下を横取りして
 * アプリ内ビューアへ回す/自動DLを抑止するのに使う。Moodleの pluginfile 直リンクと
 * 代表的な文書拡張子を対象にする。
 */
export function isDownloadableFileUrl(url: string): boolean {
  if (/\/pluginfile\.php\//i.test(url)) return true
  return /\.(pdf|docx?|pptx?|xlsx?|zip|csv)(\?|#|$)/i.test(url)
}

/** アプリ内pdf.jsビューアで表示できるPDFらしいURLか（pluginfileの.pdf含む）。 */
export function isPdfLikeUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url)
}

/**
 * コースページの各アクティビティ（/mod/* リンク）の隣に「＋追加」ボタンを差し込む（冪等）。
 * 押すと postMessage(type:'addActivity') で種別・URL・名称・科目名を返す。RN側で追跡に加える。
 * 拡張機能のように「このページから直接、追いたいものだけ追加」を実現する。
 */
export const INJECT_COURSE_ADD_BUTTONS_JS = `(function(){
  try {
    if (window.__litusCourseBtns) return true;
    window.__litusCourseBtns = true;
    var courseName = '';
    var h1 = document.querySelector('.page-header-headings h1, #page-header h1, h1');
    if (h1) courseName = (h1.textContent || '').replace(/\\s+/g,' ').trim();
    function mk(a){
      var href = a.getAttribute('href') || '';
      if (!/\\/mod\\//.test(href)) return;
      if (a.__litusBtn) return; a.__litusBtn = true;
      var nameEl = a.querySelector('.instancename');
      var name = ((nameEl || a).textContent || '').replace(/\\s+/g,' ').trim();
      var accesshide = a.querySelector('.accesshide'); if (accesshide) name = name.replace((accesshide.textContent||'').trim(),'').trim();
      var b = document.createElement('button');
      b.textContent = '＋追加';
      b.setAttribute('type','button');
      b.style.cssText = 'margin-left:8px;padding:2px 10px;font-size:12px;line-height:1.6;border:1px solid #0aa579;color:#0aa579;background:#eafaf5;border-radius:12px;vertical-align:middle;cursor:pointer;';
      b.addEventListener('click', function(ev){
        ev.preventDefault(); ev.stopPropagation();
        b.textContent = '追加済み'; b.style.color='#8a8a8a'; b.style.borderColor='#d0d0d0'; b.style.background='#f2f2f2';
        var mod = (href.match(/\\/mod\\/([a-z]+)\\//) || [])[1] || '';
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'addActivity', url: a.href, title: name, mod: mod, courseName: courseName }));
      }, true);
      var host = a.closest ? (a.closest('.activityinstance') || a.parentNode) : a.parentNode;
      (host || a.parentNode || a).appendChild(b);
    }
    var links = document.querySelectorAll('li.activity a.aalink, li.activity a[href*="/mod/"], .activityinstance a[href*="/mod/"]');
    Array.prototype.forEach.call(links, mk);
    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'courseButtons', count: links.length }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'error', message:String(e) }));
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
