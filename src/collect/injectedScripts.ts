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
    // 診断マーカー（COLLECT_BULLETIN_TABS_JSと同型）: ヘルス判定(層2)が tables=0 の原因を切り分ける。
    var body = document.body ? (document.body.innerText || '') : '';
    var hasPwd = !!document.querySelector('input[type=password]');
    var btns = Array.prototype.slice.call(document.querySelectorAll('a,button,input[type=submit]'));
    var hasLogout = btns.some(function(b){ var t=((b.textContent||b.value)||''); return t.indexOf('ログアウト')>=0 || /logout/i.test(b.getAttribute&&(b.getAttribute('href')||'')); });
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'timetable',
      tables: tables,
      jigen: jigen ? jigen.textContent : '',
      page: (location.pathname||'').split('/').pop() || '',
      pwd: hasPwd?1:0, logout: hasLogout?1:0, blen: body.length
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
    // 着地ガード: 既に時間割ページ(table.classTable)に居るならメニューを叩かない（onLoadEnd毎の
    // 再クリック→再POSTループを防ぐ。収集(COLLECT)は別途走るのでここでは遷移だけ抑止）。
    if (document.querySelector('table.classTable')) {
      post({ type: 'nav', ok: true, stage: 'timetable-already' });
    } else {
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
    // 科目名（実DOM 2026-07-10: .sizeBig は「時刻」と「科目名」の2つに使われるため、時刻でない方を採る）。
    var courseName = '';
    var sbTime = /^\\d{1,2}:\\d{2}\\s*[～~〜]\\s*\\d{1,2}:\\d{2}$/;
    var sbs = Array.prototype.slice.call(document.querySelectorAll('.sizeBig'));
    for (var si=0; si<sbs.length; si++) {
      var st = (sbs[si].textContent||'').replace(/\\s+/g,' ').trim();
      if (st && !sbTime.test(st)) { courseName = st; break; }
    }
    if (!courseName) { var m = body.match(/\\d{1,2}:\\d{2}\\s*[～~]\\s*\\d{1,2}:\\d{2}\\s+([^\\n]{2,40})/); if (m) courseName = m[1].trim(); }
    // 受付時間（実DOM: label.signSize=「出席確認時間：10:20～12:00」）。判定はRN側 parseAttendanceMessage。
    var ssEl = document.querySelector('.signSize');
    var signSize = ssEl ? (ssEl.textContent||'') : '';
    // .attendSuc=出席が記録された確定マーカー（どのデバイスで出しても付く）
    var attendSuc = !!document.querySelector('.attendSuc');
    // 未提出（受付中）: 認証コード欄（実DOM: input.verification が4箱）／「出席登録する」ボタンの存在
    var verif = document.querySelectorAll('input.verification');
    var btns = Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],a'));
    var hasSubmitBtn = btns.some(function(b){ return (((b.textContent||b.value)||'').replace(/\\s+/g,'')).indexOf('出席登録する')>=0; });
    var hasCodeInput = verif.length>0 || hasSubmitBtn || body.indexOf('認証コード')>=0;
    // 受付終了マーカー / 残り秒（実DOM: label.signFlging=「出席確認中」or「…終了」, label.timeSum=残り秒）
    var flg = document.querySelector('.signFlging');
    var signEnded = !!(flg && /終了/.test(flg.textContent||''));
    var tsEl = document.querySelector('.timeSum');
    var timeSum = null;
    if (tsEl) { var n = parseInt((tsEl.textContent||'').replace(/[^0-9-]/g,''),10); if(!isNaN(n)) timeSum = n; }
    if (timeSum!==null && timeSum<=0) signEnded = true;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'attendance',
      text: body,
      courseName: courseName,
      signSize: signSize,
      attendSuc: attendSuc,
      hasCodeInput: hasCodeInput,
      signEnded: signEnded,
      timeSum: timeSum
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
    // PC等の他画面と競合（複数の画面でご利用/別の画面で操作された）は専用ハンドリングのため分離する。
    var hasMultiScreen = /別の画面で操作|複数の画面でご利用/.test(body);
    var hasSystemError = /システムエラー|ViewExpired|この画面を閉じてください/.test(body);
    // 過去のリクエスト=SAMLリプレイ拒否 / CSRF=並走SSO等でフォームのトークンが無効化された状態。
    // どちらも「フローが壊れた」なので新しいWebViewでフォームを取り直す（gateのrecover対象）。
    var hasSsoStale = /過去のリクエスト|CSRF/i.test(body);
    // CLASSの定時メンテナンス（毎日2:00〜4:00）。この間はログインもできないので専用表示にする。
    var hasMaintenance = /システムメンテナンス|メンテナンス中|ただいまメンテナンス|ご利用いただけません/.test(body);
    // 掲示一覧に着地したか（frameset対応）。掲示は子フレーム内に載りトップURLはXut12401のままなので、
    // URLでなく dl.keiji の有無で判定する。トップ＋同一オリジンフレームを横断して探す。
    var hasBulletinList = !!document.querySelector('dl.keiji');
    try { var _fr=document.querySelectorAll('iframe,frame'); for(var _i=0;_i<_fr.length && !hasBulletinList;_i++){ try{ var _d=_fr[_i].contentDocument; if(_d && _d.querySelector('dl.keiji')) hasBulletinList=true; }catch(e){} } }catch(e){}
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'page', hasPasswordInput: hasPassword, hasAttendanceForm: hasAttendanceForm,
      hasEnterSplash: hasEnterSplash, hasClassMenu: hasClassMenu, hasLogout: hasLogout,
      hasSystemError: hasSystemError, hasMultiScreen: hasMultiScreen, hasSsoStale: hasSsoStale,
      hasMaintenance: hasMaintenance, hasBulletinList: hasBulletinList, url: location.href
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
  true;
})();`

/** SSOセッションを黙って温める先読み対象（CLASS=出席/時間割、LETUS=課題）。 */
export const CLASS_TOP_URL = 'https://class.admin.tus.ac.jp/'

/** CLASS掲示一覧ページ(Bsd00701)。実測2026-07-11: メニュー「掲示板」(menuid=0)の着地先。機能ID [Bsd007]。
 *  旧値 Bsa00101/Xut12401 は誤り。メニュー発火が失敗した時の直リンク最終フォールバックに使う。 */
export const BULLETIN_URL = 'https://class.admin.tus.ac.jp/uprx/up/bs/bsd007/Bsd00701.xhtml'

/** 現在のCLASS WebViewを掲示一覧ページへ遷移させる（menuForm発火が使えないときの最終フォールバック）。 */
export const GO_BULLETIN_JS = `(function(){ try { window.location.href='${BULLETIN_URL}'; } catch(e){} true; })();`

/**
 * メインメニューの「掲示板」へ遷移する（実DOM 2026-07-09: ログイン後の着地は時間帯で変わる＝授業中は
 * モバイル出席登録、平常はホーム/アンケート等。掲示は着地に頼らず**常設メニューから遷移**するのが正解）。
 * メニューの `<a>` の本当の遷移は onclick("confirmIfModified(this)") ではなく **data-pfconfirmcommand**
 * （syncTransition＋menuForm submit・menuid='0'）に入っており、confirmIfModified は「変更あり」時に確認
 * ダイアログでheadlessを止める危険がある。よって data-pfconfirmcommand を **直接実行**して確実に送信する
 * （無ければ onclick → click の順にフォールバック）。menuForm.submit() はフルPOST＝新規ロードなので、
 * 遷移後の onLoadEnd で COLLECT_BULLETIN_JS を流せば dl.keiji を拾える。
 */
export const OPEN_BULLETIN_JS = `(function(){
  function post(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function norm(s){ return ((s||'')+'').replace(/\\s+/g, ''); }
  // 対象ドキュメント群 = トップ＋同一オリジンで参照できる iframe/frame の contentDocument。
  // Xut12401 が frameset/iframe ラッパーで、メニューが子フレーム内にある場合に備えて中も探す。
  function docs(){
    var ds = [document];
    try {
      var fr = Array.prototype.slice.call(document.querySelectorAll('iframe,frame'));
      for (var i=0;i<fr.length;i++){ try { var d = fr[i].contentDocument; if (d) ds.push(d); } catch(e){} }
    } catch(e){}
    return ds;
  }
  // 時間割/出席で実証済みのアンカー探索に合わせる: 全<a>からテキスト部分一致→menuForm/mainMenu優先。子フレームも横断。
  function findAnchor(text){
    var hits = [];
    var ds = docs();
    for (var i=0;i<ds.length;i++){
      var as = Array.prototype.slice.call(ds[i].querySelectorAll('a'));
      for (var j=0;j<as.length;j++){
        var a = as[j];
        var s = a.querySelector('.ui-menuitem-text');
        var label = norm(s ? s.textContent : a.textContent);
        if (label.indexOf(text) >= 0) hits.push(a);
      }
    }
    var menu = hits.filter(function(a){ var idn = (a.id || a.name || ''); return idn.indexOf('menuForm') >= 0 || idn.indexOf('mainMenu') >= 0; });
    return (menu.length ? menu : hits)[0] || null;
  }
  function anyKeiji(){ var ds = docs(); for (var i=0;i<ds.length;i++){ if (ds[i].querySelector('dl.keiji')) return true; } return false; }
  // アンカーの所属ドキュメントの window で発火する（子フレーム内のメニューは、そのフレームの PrimeFaces
  // スコープで data-pfconfirmcommand を実行しないと ReferenceError で空振り→トップが空遷移する）。
  function fireIn(el){
    var win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
    var F = win.Function || Function;
    var ME = win.MouseEvent || MouseEvent;
    var dpc = el.getAttribute('data-pfconfirmcommand');
    try {
      if (dpc) { F(dpc).call(el); return 'pfconfirm'; }
      var oc = el.getAttribute('onclick');
      if (oc) { F('event', oc).call(el, new ME('click', { bubbles: true })); return 'onclick'; }
      el.click(); return 'click';
    } catch (e) {
      try { el.click(); return 'click-fb'; } catch (e2) { return 'err'; }
    }
  }
  function landscape(){
    var na = document.querySelectorAll('a').length;
    var nif = document.querySelectorAll('iframe,frame').length;
    var nfm = document.querySelectorAll('form').length;
    var nsc = document.querySelectorAll('script').length;
    var hb = document.body ? (document.body.innerHTML || '').length : 0;
    var ttl = norm(document.title).slice(0, 16);
    return 'menu-bulletin[a='+na+',if='+nif+',fm='+nfm+',sc='+nsc+',h='+hb+',t='+ttl+']';
  }
  // 条件待ち: 固定待ちだと Xut12401 の過渡状態(フレーム未生成/空)を引いて空振りする。掲示アンカーが
  // 現れるまで最大約6秒ポーリングし、現れ次第そのフレーム文脈で一度だけ発火する。
  var tries = 0, MAX = 20; // 20 * 300ms ≈ 6s
  function tick(){
    tries++;
    try {
      if (window.__litusBulletinFired) { post({ type: 'nav', ok: true, stage: 'bulletin-fired' }); return; }
      if (anyKeiji()) { post({ type: 'nav', ok: true, stage: 'bulletin-already' }); return; }
      var target = findAnchor('掲示');
      if (target) {
        window.__litusBulletinFired = true;
        var inFrame = target.ownerDocument !== document ? 1 : 0;
        var m = fireIn(target);
        post({ type: 'nav', ok: m !== 'err', stage: 'bulletin-click', method: m, frame: inFrame });
        return;
      }
      if (tries >= MAX) { post({ type: 'nav', ok: false, stage: landscape() }); return; }
      setTimeout(tick, 300);
    } catch (e) {
      post({ type: 'error', message: String(e) });
    }
  }
  tick();
})(); true;`

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

/**
 * ページ内の全掲示行(div.alignRight>dl.keiji)を連結して送る。行にはフラグ/既読ボタンが含まれるので
 * parseBulletinList が状態(未読/フラグ)を読める。同一掲示が複数タブに出るが RN側 mergeBulletinItems が
 * id で dedup＋状態OR統合する。特定タブ(未読/フラグつき)のallScr限定だと、PrimeFacesが非アクティブタブを
 * 遅延描画する着地では空になり得るため、**タブ非依存で全行を拾う**（既定のグループタブにも状態ボタン付き行がある）。
 */
export const COLLECT_BULLETIN_TABS_JS = `(function(){
  function post(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  // Xut12401 は frameset/iframe ラッパー。掲示一覧は子フレーム内に読み込まれるため、トップだけ見ると空になる。
  // トップ＋同一オリジンで参照可能な全フレームを横断して dl.keiji を集める。
  function docs(){
    var ds=[document];
    try { var fr=Array.prototype.slice.call(document.querySelectorAll('iframe,frame'));
      for(var i=0;i<fr.length;i++){ try{ var d=fr[i].contentDocument; if(d) ds.push(d); }catch(e){} } }catch(e){}
    return ds;
  }
  function scan(){
    var ds = docs();
    var out='', align=0, dlTotal=0, blen=0, hlen=0, hasTab=false, hasPwd=false, hasLogout=false, keijiPage='';
    for(var di=0; di<ds.length; di++){
      var d = ds[di];
      var dls = d.querySelectorAll('dl.keiji'); dlTotal += dls.length;
      // Bsd00701(タブ付き)は各行が div.alignRight でボタンを持つ→親要素ごと拾ってフラグ/既読状態も得る。
      var blocks = d.querySelectorAll('.alignRight');
      var wrapHit = false;
      for(var i=0;i<blocks.length;i++){ if(blocks[i].querySelector('dl.keiji')){ out += blocks[i].outerHTML; align++; wrapHit = true; } }
      // フォールバック: 素の dl.keiji ページ(.alignRightラッパ無し)は dl を直接連結。
      if(dls.length && !wrapHit){ for(var k=0;k<dls.length;k++){ out += dls[k].outerHTML; } }
      // keiji を持つフレームの pathname を page として報告（health の bsd007 判定を通すため）。
      if(dls.length && !keijiPage){ try{ keijiPage=((d.location&&d.location.pathname)||'').split('/').pop()||''; }catch(e){} }
      var b = d.body ? (d.body.innerText||'') : ''; if(b.length>blen) blen=b.length;
      var h = d.body ? (d.body.innerHTML||'') : ''; if(h.length>hlen) hlen=h.length;
      if(d.querySelector('[id$="tabArea"], .ui-tabs')) hasTab=true;
      if(d.querySelector('input[type=password]')) hasPwd=true;
      var btns = Array.prototype.slice.call(d.querySelectorAll('a,button,input[type=submit]'));
      if(btns.some(function(x){ var t=((x.textContent||x.value)||''); return t.indexOf('ログアウト')>=0 || /logout/i.test(x.getAttribute&&(x.getAttribute('href')||'')); })) hasLogout=true;
    }
    return {
      type: 'bulletin', html: '<div>'+out+'</div>', count: dlTotal, align: align,
      page: keijiPage || ((location.pathname||'').split('/').pop() || ''), fr: ds.length-1,
      tab: hasTab?1:0, pwd: hasPwd?1:0, logout: hasLogout?1:0, blen: blen, hlen: hlen
    };
  }
  // 条件待ち: メニュー発火→フレームへ掲示ロードは非同期。dl.keiji が現れるまで最大約6秒ポーリングし、
  // 現れ次第 or タイムアウトで送る（固定待ちの空振りレースを解消）。
  var tries = 0, MAX = 15; // 15 * 400ms ≈ 6s
  function tick(){
    tries++;
    try {
      var r = scan();
      if (r.count > 0 || tries >= MAX) { post(r); return; }
      setTimeout(tick, 400);
    } catch (e) {
      post({ type: 'error', message: String(e) });
    }
  }
  tick();
})(); true;`

/**
 * フレーム横断ヘルパ群（Xut12401 frameset 対応）。掲示の行/状態ボタン/詳細モーダルは子フレーム内にあるため、
 * トップ＋同一オリジン全フレームを横断して探索・発火する。各注入スクリプト冒頭に展開して使う。
 * - qsAll/qsOne: 全docへ querySelectorAll/querySelector を横断。
 * - fireEl: 要素の所属フレームの window.Function で data-pfconfirmcommand/onclick を実行（PrimeFacesスコープ解決）。
 * - fireChange: checkbox を所属フレームの Event で change 発火（既読/フラグ切替の onchange=PrimeFaces.ab を起こす）。
 */
const FRAME_PRELUDE = `
  function docs(){ var ds=[document]; try{ var fr=Array.prototype.slice.call(document.querySelectorAll('iframe,frame')); for(var _i=0;_i<fr.length;_i++){ try{ var _d=fr[_i].contentDocument; if(_d) ds.push(_d); }catch(e){} } }catch(e){} return ds; }
  function qsAll(sel){ var ds=docs(), out=[]; for(var _i=0;_i<ds.length;_i++){ try{ var ns=ds[_i].querySelectorAll(sel); for(var _j=0;_j<ns.length;_j++) out.push(ns[_j]); }catch(e){} } return out; }
  function qsOne(sel){ var ds=docs(); for(var _i=0;_i<ds.length;_i++){ try{ var n=ds[_i].querySelector(sel); if(n) return n; }catch(e){} } return null; }
  function fireEl(el){ var win=(el.ownerDocument&&el.ownerDocument.defaultView)||window; var F=win.Function||Function; var ME=win.MouseEvent||MouseEvent; var dpc=el.getAttribute&&el.getAttribute('data-pfconfirmcommand'); try{ if(dpc){ F(dpc).call(el); return 'pfconfirm'; } var oc=el.getAttribute&&el.getAttribute('onclick'); if(oc){ F('event',oc).call(el, new ME('click',{bubbles:true})); return 'onclick'; } el.click(); return 'click'; }catch(e){ try{ el.click(); return 'click-fb'; }catch(e2){ return 'err'; } } }
  function fireChange(box){ var win=(box.ownerDocument&&box.ownerDocument.defaultView)||window; var EV=win.Event||Event; box.checked=!box.checked; box.dispatchEvent(new EV('change',{bubbles:true})); }
`

/**
 * 日付＋件名で行を特定し、(1)掲示内容モーダルが未オープンなら件名リンクで開く、(2)未読なら少し遅らせて
 * 既読化する（CLASS側で確実に既読へ）。冪等なので複数回発火しても二重操作にならない（モーダル既開/既読は
 * スキップ）。onLoadEnd毎の再注入やRN側タイマの取りこぼしに対して安全。frameset対応でフレーム内も横断。
 */
export function openBulletinDetailJs(title: string, date: string): string {
  return `(function(){
    ${FRAME_PRELUDE}
    var t=${JSON.stringify(title)}, d=${JSON.stringify(date)}, tries=0;
    function post(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
    function findRow(){
      var dls=qsAll('dl.keiji');
      for(var i=0;i<dls.length;i++){
        var a=dls[i].querySelector('a.ui-commandlink'); if(!a) continue;
        var tt=(a.textContent||'').replace(/\\s+/g,' ').trim();
        var dd=((dls[i].textContent||'').match(/\\d{4}\\/\\d{1,2}\\/\\d{1,2}/g)||[]).pop()||'';
        if(tt===t && dd===d) return { dl: dls[i], a: a };
      }
      return null;
    }
    function step(){
      try{
        var r=findRow();
        if(!r){
          tries++;
          // 行がまだ描画されていない（メニュー発火→フレームへ掲示ロードは非同期）。少し待って再探索する。
          if(tries<12){ setTimeout(step, 600); return; }
          post({type:'nav',ok:false,stage:'detail-notfound',keiji:qsAll('dl.keiji').length});
          return;
        }
        var panel=qsOne('[id="bsd00702:dialogPanel"]');
        var opened=panel && /本文/.test(panel.innerHTML||'');
        // 件名リンクをフレーム文脈で発火してモーダルを開く（トップ文脈だとPrimeFaces未解決で空振り）。
        // モーダルを開くこと自体でCLASS側は既読になる（一覧行が「未読にする」表示へ変わる）。
        // ここで別途「既読にする」チェックボックスを撃つと、モーダル開閉で更新された行バージョンに対し
        // 古いバージョンの既読postbackを送る形になり「対象データは他のユーザによって編集されました」の
        // 楽観ロック競合を誘発する。よって明示的な既読トグルは行わない（ローカル既読は呼び出し側が設定）。
        if(!opened){ fireEl(r.a); }
        post({type:'nav',ok:true,stage:'detail-open'});
      }catch(e){ post({type:'error',message:String(e)}); }
    }
    step();
  })(); true;`
}

/** 掲示内容モーダルの中身(#bsd00702:dialogPanel)を抽出。テーブル描画済みのときだけ ready=true。 */
export const COLLECT_BULLETIN_DETAIL_JS = `(function(){
  ${FRAME_PRELUDE}
  try{
    var p=qsOne('[id="bsd00702:dialogPanel"]');
    var html=p?p.innerHTML:'';
    var ready=/singleTable|ui-panelgrid/.test(html) && /本文/.test(html);
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type:'bulletinDetail', html: ready?html:'', ready: ready, panel: p?1:0, plen: html.length
    }));
  }catch(e){ window.ReactNativeWebView.postMessage(JSON.stringify({ type:'error', message:String(e) })); }
})(); true;`

/**
 * 対象行のフラグを「desired（true=フラグ付き）」の状態へ合わせる（インテント絶対・冪等）。
 * 現在のボタン文言（フラグをはずす=済 / フラグをつける=未）を読み、desired と異なる時だけ checkbox を切替えて
 * change を発火する。ローカルとCLASSのフラグ状態がズレていても意図どおりに揃い、複数回発火でも二重反転しない。
 */
export function setBulletinFlagJs(title: string, date: string, desired: boolean): string {
  return `(function(){
    ${FRAME_PRELUDE}
    var t=${JSON.stringify(title)}, d=${JSON.stringify(date)}, want=${desired ? 'true' : 'false'}, tries=0;
    function post(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
    function findRow(){
      var dls=qsAll('dl.keiji');
      for(var i=0;i<dls.length;i++){
        var a=dls[i].querySelector('a.ui-commandlink'); if(!a) continue;
        var tt=(a.textContent||'').replace(/\\s+/g,' ').trim();
        var dd=((dls[i].textContent||'').match(/\\d{4}\\/\\d{1,2}\\/\\d{1,2}/g)||[]).pop()||'';
        if(tt===t && dd===d) return dls[i];
      }
      return null;
    }
    function step(){
      try{
        var dl=findRow();
        if(!dl){ tries++; if(tries<12){ setTimeout(step,600); return; } post({type:'nav',ok:false,stage:'flag-notfound'}); return; }
        var row=dl.parentNode, btns=row?row.querySelectorAll('.btnRead'):[], flagBtn=null;
        for(var j=0;j<btns.length;j++){ if(/フラグ/.test(btns[j].textContent||'')){ flagBtn=btns[j]; break; } }
        if(!flagBtn){ post({type:'nav',ok:false,stage:'flag-nobtn'}); return; }
        var cur=/フラグをはずす/.test(flagBtn.textContent||''); // true=現在フラグ済み
        if(cur===want){ post({type:'nav',ok:true,stage:'flag-nochange'}); return; }
        var box=flagBtn.querySelector('input[type=checkbox]');
        fireChange(box); // 所属フレームの Event で change 発火（onchange=PrimeFaces.ab をフレーム文脈で起こす）
        post({type:'nav',ok:true,stage:'flag-set'});
      }catch(e){ post({type:'error',message:String(e)}); }
    }
    step();
  })(); true;`
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
      // 行の右端にfloatで寄せ、リンク本体のタップ領域と物理的に分離する（誤タップでリンクが開くのを防ぐ）。
      // タップを確実にボタンで受けるため z-index を上げ、伝播も止める。
      b.style.cssText = 'float:right;margin:2px 0 6px 10px;padding:7px 14px;font-size:13px;line-height:1.4;border:1px solid #0aa579;color:#0aa579;background:#eafaf5;border-radius:14px;cursor:pointer;position:relative;z-index:20;';
      function onAdd(ev){
        ev.preventDefault(); ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        b.textContent = '追加済み'; b.style.color='#8a8a8a'; b.style.borderColor='#d0d0d0'; b.style.background='#f2f2f2';
        var mod = (href.match(/\\/mod\\/([a-z]+)\\//) || [])[1] || '';
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'addActivity', url: a.href, title: name, mod: mod, courseName: courseName }));
      }
      // touchstart/clickの両方を捕捉相で受け、アンカーへ届く前に握りつぶす。
      b.addEventListener('click', onAdd, true);
      b.addEventListener('touchend', onAdd, true);
      // 行(li.activity)の先頭に入れると float:right で右端に回り、左のリンクと重ならない。
      var host = (a.closest && (a.closest('li.activity') || a.closest('.activityinstance'))) || a.parentNode;
      if (host) host.insertBefore(b, host.firstChild); else a.parentNode.appendChild(b);
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
