/** PDF共有（端末アプリで開く）の純粋ロジック。RN非依存でvitestテスト可能に保つ。 */

export const PDF_SHARE_LIMIT_BYTES = 25 * 1024 * 1024

/** ブリッジを圧迫しない範囲か（0以下や上限超は不可）。 */
export function isWithinShareLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= PDF_SHARE_LIMIT_BYTES
}

// ファイル名に使えない文字だけを落とす（許可リストにすると日本語が丸ごと消える）。
// 制御文字 / Windows禁止文字 <>:"/\|?* / URIで意味を持つ %#
// （Android は Uri.getPath が %エスケープを復号し、iOS は URL 変換失敗時に自動 %エンコードして
//  %25 を % に戻すため、生の % を残すと file:// URI が壊れる）。
const UNSAFE_FILENAME_CHARS = /[\u0000-\u001f<>:"/\\|?*%#]/g
// Windows 予約名（共有先がPCの場合に備える）
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
// ext4/APFS の1要素255バイト制限に対する余裕。日本語はUTF-8で3バイト/字なので文字数では足りない。
const MAX_BASENAME_BYTES = 180

/** UTF-8バイト長で切り詰める（サロゲートペアを割らない）。 */
function truncateBytes(s: string, max: number): string {
  const enc = new TextEncoder()
  if (enc.encode(s).length <= max) return s
  let out = ''
  let n = 0
  for (const ch of s) {
    const b = enc.encode(ch).length
    if (n + b > max) break
    out += ch
    n += b
  }
  return out
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
  // 使えない文字だけを_へ（日本語などはそのまま残す）
  let name = last
    .replace(UNSAFE_FILENAME_CHARS, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    // 先頭の . を落として隠しファイル化と ../ を封じる
    .replace(/^[_.\s]+|[_.\s]+$/g, '')
  if (/\.pdf$/i.test(name)) name = name.slice(0, -4).replace(/[_.\s]+$/g, '')
  if (!name) return 'document.pdf'
  if (RESERVED_NAMES.test(name)) name = '_' + name
  name = truncateBytes(name, MAX_BASENAME_BYTES).replace(/[_.\s]+$/g, '')
  if (!name) return 'document.pdf'
  return name + '.pdf'
}

/** 取得したものの正体。ok 以外は端末アプリへ渡してはいけない。 */
export type SharePayloadKind = 'ok' | 'login' | 'notPdf'

// PDFは必ず "%PDF-" で始まる（ISO 32000-1）。base64にすると先頭が 'JVBERi0'。
const PDF_BASE64_PREFIX = 'JVBERi0'
// '<!DOCTYPE html' / '<!doctype html' / '<html' の base64 先頭。
// base64は3バイト境界で切れるので、先頭4文字（＝3バイト）だけで判定する。
const HTML_BASE64_PREFIXES = ['PCFE', 'PCFk', 'PGh0', 'PEhU']

/**
 * 共有前の検算。**HTTP 200 だから中身がPDFとは限らない**。
 *
 * 実機報告(2026-07-22): PDFを共有すると CLASS のログインページHTMLが .pdf として保存された。
 * ログインページは 200 で返るため `res.ok` を素通りし、`mimeType:'application/pdf'` を
 * 名乗って端末へ渡っていた。認証切れという**回復可能な状態が、黙ってファイルを壊す**形で
 * 出ていたので、渡す直前に正体を確かめて分岐する。
 */
export function classifySharePayload(p: { dataBase64: string; contentType: string | null }): SharePayloadKind {
  const ct = (p.contentType ?? '').toLowerCase()
  const b64 = p.dataBase64 ?? ''
  // content-type が html ならマジックバイトを待たずログイン扱い（本文が空でも判定できる）。
  if (ct.includes('text/html')) return 'login'
  if (b64.startsWith(PDF_BASE64_PREFIX)) return 'ok'
  if (HTML_BASE64_PREFIXES.some((h) => b64.startsWith(h))) return 'login'
  return 'notPdf'
}

/**
 * WebView（PDFと同一オリジン）へ注入するJS。window.__PDF_URL をCookie付きで取得し、
 * サイズ判定のうえbase64でRNへ渡す。取得/サイズ失敗はstage:'shareError'で通知。
 * **content-type も持ち帰る**（RN側の classifySharePayload が正体を判定するため）。
 */
export function buildSharePdfJs(): string {
  return `(function(){
    try {
      var url = window.__PDF_URL;
      var contentType = null;
      fetch(url, { credentials: 'include' }).then(function(res){
        if(!res.ok){ throw new Error('http ' + res.status); }
        contentType = res.headers.get('content-type');
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
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'pdf', stage:'share', dataBase64:b64, bytes:bytes, contentType:contentType}));
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
