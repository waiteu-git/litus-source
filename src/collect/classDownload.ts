/**
 * CLASS（JSF/PrimeFaces）の添付ファイルを、WebView内で受け取るための純粋層＋注入JS。
 *
 * 背景（2026-07-22・カナリアの実セッションで実証）:
 * CLASSの添付ダウンロードは2段構え。①`PrimeFaces.ab` のajaxでサーバ側にファイルを用意させ、
 * ②成功したら隠しボタンを押して `<form method="post" action="/uprx/up/bs/bsd007/Bsd00701.xhtml">`
 * を**非ajaxでPOST送信**しファイルを流す。フォームには `javax.faces.ViewState` と CLASS 独自の
 * `rx-token`/`rx-loginKey` が同梱される。
 *
 * ところが react-native-webview は、この POST の応答（Content-Disposition つき）を受け取ると
 * **中身を捨てて URL だけ** を Android の DownloadManager に渡す。DownloadManager は同じURLを
 * **素のGET**で取り直すが、それはただのJSFページURLなので CLASS はログインポータルを返す。
 * 結果、**正しい添付ファイル名でログインページのHTMLが保存される**という症状になっていた。
 * Cookie の問題ではない（RNWのCookie取得を全URL化しても直らないことを実機で反証済み）。
 *
 * したがって DownloadManager に渡す前に、**同じPOSTを WebView 内の fetch で撃って blob を取る**。
 * 実サーバに対して実証済み: status 200 / application/pdf / 419,732 bytes / 先頭 "%PDF-1.6"。
 */

/** ブリッジを圧迫しない上限（PDF共有と同じ基準）。 */
export const CLASS_DOWNLOAD_LIMIT_BYTES = 25 * 1024 * 1024

/**
 * RFC 2047 の encoded-word（`=?charset?B|Q?text?=`）を復号する。
 *
 * CLASSはファイル名をこの形式で返す。復号しないと Android 側のサニタイズで
 * `=-1` のようなゴミ名になる（実機で観測）。
 * **隣接する encoded-word の間の空白は捨てる**のが RFC2047 の規定で、
 * 素直に連結すると実ファイル名に余計な空白が入る。
 */
export function decodeRfc2047(s: string): string {
  if (!s || s.indexOf('=?') < 0) return s
  const word = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g
  // まず encoded-word の位置を集め、隣接（間が空白のみ）なら空白を落とす。
  type Piece = { start: number; end: number; text: string | null }
  const pieces: Piece[] = []
  let m: RegExpExecArray | null
  while ((m = word.exec(s))) {
    pieces.push({ start: m.index, end: m.index + m[0].length, text: decodeWord(m[1], m[2], m[3]) })
  }
  if (!pieces.length) return s
  let out = ''
  let cursor = 0
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]
    let gap = s.slice(cursor, p.start)
    // 直前も encoded-word で、間が空白だけなら捨てる（RFC2047）。
    if (i > 0 && pieces[i - 1].text !== null && p.text !== null && /^[ \t]*$/.test(gap)) gap = ''
    out += gap + (p.text ?? s.slice(p.start, p.end))
    cursor = p.end
  }
  return out + s.slice(cursor)
}

function decodeWord(charset: string, enc: string, body: string): string | null {
  try {
    const bytes = /[Bb]/.test(enc) ? base64ToBytes(body) : quotedPrintableToBytes(body)
    if (!bytes) return null
    // CLASSは UTF-8 固定だが、他charsetが来たら諦めて null（呼び出し側が原文を残す）。
    if (!/^utf-?8$/i.test(charset)) return null
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function base64ToBytes(b64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null
  try {
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function quotedPrintableToBytes(q: string): Uint8Array {
  // Q encoding では '_' が空白を表す。
  const s = q.replace(/_/g, ' ')
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && i + 2 < s.length) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16))
      i += 2
    } else out.push(s.charCodeAt(i))
  }
  return new Uint8Array(out)
}

/** Content-Disposition から本当のファイル名を取り出す。取れなければ null。 */
export function filenameFromContentDisposition(cd: string | null | undefined): string | null {
  if (!cd) return null
  // RFC5987 の filename*= を優先（charset''percent-encoded）。
  const star = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(cd)
  if (star) {
    try {
      return decodeURIComponent(star[2].trim())
    } catch {
      /* 壊れていれば素の filename へ落ちる */
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|([^;]+))/i.exec(cd)
  if (!plain) return null
  const raw = (plain[2] ?? plain[3] ?? '').trim()
  if (!raw) return null
  return decodeRfc2047(raw)
}

/**
 * CLASSのWebViewへ注入する。フォーム送信を **capture** で横取りし、同じPOSTを fetch で撃つ。
 *
 * - capture でないと JSF/PrimeFaces のハンドラに先を越される。
 * - `FormData(form, submitter)` で「どのボタンが押されたか」を含める。JSFはこれで動作を識別するため、
 *   落とすとサーバは何のリクエストか分からずログインページを返す（実証済みの submitter は隠しボタン）。
 * - `credentials: 'include'` は必須。
 * - **ファイルでない応答（＝ログインページ等）は握り潰さず理由を返す**。HTTP 200 でも中身がPDFとは限らない。
 */
export const CLASS_DOWNLOAD_CAPTURE_JS = `(function(){
  if (window.__litusDlHooked) { return true; }
  window.__litusDlHooked = true;
  var LIMIT = ${CLASS_DOWNLOAD_LIMIT_BYTES};
  function post(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
  document.addEventListener('submit', function(e){
    var form = e.target;
    if (!form || !form.action) { return; }
    // 添付DL以外の通常のJSF送信を止めない。ファイル一覧の中から起きた送信だけを対象にする。
    var fromFileList = !!(e.submitter && e.submitter.closest && e.submitter.closest('.fileListArea'));
    if (!fromFileList) { return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    post({ type: 'classDownload', stage: 'start' });
    var body;
    try { body = new FormData(form, e.submitter); }
    catch (_) {
      body = new FormData(form);
      if (e.submitter && e.submitter.name) { body.append(e.submitter.name, e.submitter.value || ''); }
    }
    fetch(form.action, { method: 'POST', body: body, credentials: 'include' }).then(function(res){
      if (!res.ok) { throw new Error('http ' + res.status); }
      var cd = res.headers.get('content-disposition');
      var ct = res.headers.get('content-type');
      return res.blob().then(function(blob){ return { blob: blob, cd: cd, ct: ct }; });
    }).then(function(r){
      var bytes = r.blob.size;
      if (!(bytes > 0 && bytes <= LIMIT)) {
        post({ type: 'classDownload', stage: 'error', reason: 'size', bytes: bytes });
        return;
      }
      var reader = new FileReader();
      reader.onerror = function(){ post({ type: 'classDownload', stage: 'error', reason: 'read' }); };
      reader.onload = function(){
        var d = String(reader.result);
        var i = d.indexOf(',');
        post({
          type: 'classDownload', stage: 'done',
          dataBase64: i >= 0 ? d.slice(i+1) : d,
          bytes: bytes,
          contentType: r.ct,
          contentDisposition: r.cd
        });
      };
      reader.readAsDataURL(r.blob);
    }).catch(function(err){
      post({ type: 'classDownload', stage: 'error', reason: String((err && err.message) || err) });
    });
  }, true);
  return true;
})(); true;`
