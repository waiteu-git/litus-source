/**
 * 「アプリが**自動で**読み込む・保存してよいコンテンツのホストか」を判定する純粋関数。
 *
 * 動機（2026-08-28 コード監査 CONFIRMED）: LETUSページ由来のURLが**ホスト検証なし**で
 * 課題として保存され、以後 `LetusPageFetcher` の **Cookie共有・非表示WebView**で自動読み込み
 * されていた。攻撃者能力は「LETUSコースページにリンクを1本置ける」（コース編集権限者／
 * LETUS側XSS）＝`parsers/letusLinks.ts` が自ら脅威モデルとして名指ししている相手。
 *
 * 🔴**`classifyLinkTarget`（externalLink.ts）の許可リストを流用してはいけない。**
 * あちらは「アプリ内WebViewに留めるか、OSへ渡すか」の判定で、**SSOマーカーで
 * ホスト未知のURLもアプリ内に通す**（ログイン連鎖を切らないための保険）。
 * ⇒ `https://evil.example/idp/x` はあちらでは 'in-app' になる。**用途が違う。**
 *
 * 🔴**`isTargetActivityUrl`（parsers/letusLinks.ts）にホスト検証を足してはいけない。**
 * あの関数は相対パスでも呼ばれ、fixtureは `school.moodledemo.net` を102回使っている
 * （2026-08-28実測）。厳格allowlistを入れると壊れる。**入口で検証するのが正しい層。**
 */
import { hostOf } from './externalLink'

/**
 * 自動取得を許すホスト（完全一致）。⚠ここへ足す時は**実物のURLで実測してから**足すこと。
 * 「たぶんこのホストも使っている」で足すと、この検証の意味が消える。
 */
const LETUS_CONTENT_HOSTS: readonly string[] = ['letus.ed.tus.ac.jp']

/**
 * このURLをアプリが自動で読み込んで（Cookie共有WebViewに載せて）よいか。
 * **判定不能・非https・ホスト不一致はすべて false（fail-closed）。**
 * ⚠ externalLink の判定と向きが逆であることに注意＝あちらは判定不能を in-app に倒す
 * （ログインを壊さないため）。こちらは**自動取得**の可否なので、迷ったら通さない。
 */
export function isLetusContentUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!/^https:\/\//i.test(trimmed)) return false
  const host = hostOf(trimmed)
  if (!host) return false
  return LETUS_CONTENT_HOSTS.includes(host)
}
