/** PDF共有（端末アプリで開く）の純粋ロジック。RN非依存でvitestテスト可能に保つ。 */

export const PDF_SHARE_LIMIT_BYTES = 25 * 1024 * 1024

/** ブリッジを圧迫しない範囲か（0以下や上限超は不可）。 */
export function isWithinShareLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= PDF_SHARE_LIMIT_BYTES
}

/** URLからダウンロード保存用の安全なファイル名を作る。拡張子.pdfを保証。 */
export function sanitizePdfFilename(url: string): string {
  let last = ''
  try {
    const u = new URL(url)
    last = u.pathname.split('/').filter(Boolean).pop() ?? ''
  } catch {
    last = url.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? ''
  }
  try {
    last = decodeURIComponent(last)
  } catch {
    // decodeに失敗したら生のまま
  }
  // クエリ等が残っていたら落とす
  last = last.split(/[?#]/)[0]
  // 危険文字を_へ
  let name = last.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  if (!name) return 'document.pdf'
  if (!/\.pdf$/i.test(name)) name += '.pdf'
  return name
}

/**
 * WebView（PDFと同一オリジン）へ注入するJS。window.__PDF_URL をCookie付きで取得し、
 * サイズ判定のうえbase64でRNへ渡す。取得/サイズ失敗はstage:'shareError'で通知。
 */
export function buildSharePdfJs(): string {
  return `(function(){
    try {
      var url = window.__PDF_URL;
      fetch(url, { credentials: 'include' }).then(function(res){
        if(!res.ok){ throw new Error('http ' + res.status); }
        return res.blob();
      }).then(function(blob){
        var bytes = blob.size;
        if(!(bytes > 0 && bytes <= ${PDF_SHARE_LIMIT_BYTES})){
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'pdf', stage:'shareError', reason:'size', bytes:bytes}));
          return;
        }
        var reader = new FileReader();
        reader.onerror = function(){ window.ReactNativeWebView.postMessage(JSON.stringify({type:'pdf', stage:'shareError', reason:'read'})); };
        reader.onload = function(){
          var dataUrl = String(reader.result);
          var comma = dataUrl.indexOf(',');
          var b64 = comma >= 0 ? dataUrl.slice(comma+1) : dataUrl;
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'pdf', stage:'share', dataBase64:b64, bytes:bytes}));
        };
        reader.readAsDataURL(blob);
      }).catch(function(e){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'pdf', stage:'shareError', reason:String(e && e.message || e)}));
      });
    } catch(e){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'pdf', stage:'shareError', reason:'inject'}));
    }
  })(); true;`
}
