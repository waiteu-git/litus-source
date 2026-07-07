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
 * CLASSの入口スプラッシュ（CLASSロゴ＋「スマートフォン ENTER」「PC ENTER」）で「PC ENTER」を自動クリックし、
 * ポータル内部まで自動で入る（DESKTOP_UA＝PCログインが安定なのでPC側を選ぶ）。該当ボタンが無ければ何もしない。
 * 各ページ読込時に流しても入口以外では no-op。
 */
export const ENTER_CLASS_PC_JS = `(function(){
  try {
    var els = Array.prototype.slice.call(document.querySelectorAll('a,button,input[type=submit],input[type=button]'));
    var btn = els.find(function(e){
      var t = ((e.textContent || e.value) || '').replace(/\\s+/g, '');
      return t.indexOf('PC') >= 0 && /ENTER/i.test(t);
    });
    if (btn) {
      btn.click();
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nav', ok: true, stage: 'class-pc-enter' }));
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

/** SSOセッションを黙って温める先読み対象（CLASS=出席/時間割、LETUS=課題）。 */
export const CLASS_TOP_URL = 'https://class.admin.tus.ac.jp/'

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
