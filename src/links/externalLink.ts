/**
 * アプリ内WebViewに留めるURLか、OSに渡して外部アプリで開くURLかを判定する純粋関数。
 *
 * 動機（2026-07-30 実機報告）: LETUSのコースページに置かれた Box 等のリンクが
 * アプリ内WebViewで開いてしまう。このWebViewは `sharedCookiesEnabled` +
 * `thirdPartyCookiesEnabled` ＝ **LETUSのクッキージャーを共有した状態**なので、
 * 第三者サイトをそこに読み込むのは体験としてもセキュリティとしても損。
 * コースページ由来リンクの same-host 制限（`parsers/letusLinks.ts`）と同じ原則を
 * ナビゲーションにも適用する。
 *
 * **最大の制約: 大学のログインはIdPを経由するリダイレクト連鎖で成立している。**
 * 「学内ホスト以外は外部」と素朴に実装するとログインそのものが壊れる。よって
 * ①学内 `tus.ac.jp` 全体、②大学がSSOを連合しているMicrosoftのログイン基盤と
 * その従属リソース、③ホストが未知でもURLにSAML/OIDCのマーカーを持つもの
 * （将来IdPが増えても連鎖を切らないための保険）をアプリ内に残す。
 * ①②のホストは `docs/2026-07-29-third-party-connection-audit.md` の**実測**が根拠
 * （`idp.admin.tus.ac.jp` / `login.microsoftonline.com` / `aadcdn.msauth.net`）。
 *
 * **`URL` を使わない理由**: React Nativeの `URL` は正規表現ベースの簡易実装
 * （`react-native/Libraries/Blob/URL.js`）で、不正なURLでも throw せず空ホストを返す。
 * Node（vitest）の WHATWG URL とは分岐が食い違うため、判定を誤ると
 * 「テストは緑なのに実機でログインが壊れる」になる。ここでは自前の文字列解析に統一して
 * vitest と Hermes の挙動を一致させる。
 */

export type LinkTarget = 'in-app' | 'external'

/**
 * アプリ内WebViewで開いてよいホストのドメイン接尾辞（ラベル境界で一致）。
 * 学内は `tus.ac.jp` 一括（LETUS / CLASS / IdP / 図書館 / 学内Webは全部この下）。
 */
const IN_APP_HOST_SUFFIXES: readonly string[] = [
  'tus.ac.jp',
  // 大学SSOの連合先（Microsoft Entra ID）。ログイン画面本体。
  'microsoftonline.com',
  'login.microsoft.com',
  'login.live.com',
  'login.windows.net',
  // シームレスSSO（Windows統合認証の中継）。
  'microsoftazuread-sso.com',
  // ログイン画面が読む従属リソース（スクリプト・スタイル・組織ロゴ）。
  'microsoftonline-p.com',
  'msauth.net',
  'msftauth.net',
  'msauthimages.net',
]

/**
 * ホストが未知でもアプリ内に留めるURLマーカー（SAML / WS-Fed / OIDC の途中）。
 * 大学が新しいIdPを挟んでも、リダイレクト連鎖だけは外部アプリへ逃げないようにする保険。
 * Box等のファイル共有URLがこれらを含むことは実質ない。
 */
const SSO_URL_MARKERS: readonly RegExp[] = [
  /[?&]samlrequest=/i,
  /[?&]samlresponse=/i,
  /[?&]relaystate=/i,
  /\/saml/i,
  /shibboleth/i,
  /\/idp\//i,
  /\/adfs\//i,
  /wsfed/i,
  /\/oauth2?\//i,
  /openid/i,
]

/** WebViewが描画できず、OSに渡すのが唯一の扱いになるスキーム。 */
const HANDOFF_SCHEMES: readonly string[] = ['mailto', 'tel']

/** `scheme://[userinfo@]host[:port]` の scheme と host を取り出す（末尾の `@` までを userinfo 扱い）。 */
const SCHEME_RE = /^([a-z][a-z\d+\-.]*):/i
// 🔴 authority の終端に **バックスラッシュ** を含める（2026-08-28 差分監査 CONFIRMED）。
// WHATWG URL は http(s) のような special scheme で `\` を `/` と同じ区切りとして扱う。
// 含めないと `https://evil.example\@letus.ed.tus.ac.jp/...` で
//   自前の解析 → 'letus.ed.tus.ac.jp'（`evil.example\@` を userinfo と誤読）
//   実際の遷移先 → 'evil.example'
// となり、**ホスト許可リストも「安全」表示も攻撃者の道具になる**（実測）。
const HOST_RE = /^[a-z][a-z\d+\-.]*:\/\/(?:[^/?#\\]*@)?([^/?#:\\]*)/i
// WHATWG は解析前に tab/LF/CR を**位置を問わず除去する**。除去しないと同じ食い違いが起きる。
const STRIP_RE = /[\t\n\r]/g

/**
 * `scheme://[userinfo@]host` のホストを小文字・末尾ドット除去で取り出す。
 * ⚠**この関数を複製しないこと。** ホスト解析が2本あると必ずズレ、片方だけを直した時に
 * 「テストは緑なのに実機で判定が食い違う」になる。RNの `URL` を使わない理由は冒頭コメント参照。
 */
export function hostOf(url: string): string {
  const m = HOST_RE.exec(url.replace(STRIP_RE, ''))
  if (!m) return ''
  // 末尾ドット（`letus.ed.tus.ac.jp.` も同じホスト）を落として接尾辞判定を通す。
  return m[1].toLowerCase().replace(/\.+$/, '')
}

function matchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`)
}

/**
 * このURLをアプリ内WebViewで読むか、外部アプリへ渡すか。
 *
 * 判定不能（スキーム不明・ホスト空・未知スキーム）は **in-app** に倒す。
 * 外部化の誤爆はログイン導線の破壊に直結するのに対し、留める側の誤りは
 * 「従来どおりアプリ内で開く」＝現状維持で済むため。
 *
 * **`isTopFrame === true` 以外は必ず in-app**。Androidでは iframe のナビゲーションでも
 * `onShouldStartLoadWithRequest` が呼ばれるため（学内ページに埋まったYouTube / LTIツール）、
 * フレームが分からないまま外部化すると勝手に他アプリが起動する。RNW本体はAndroidで
 * `WebResourceRequest.isForMainFrame()` を捨てており `isTopFrame` は届かないので、
 * `patches/react-native-webview@13.16.1.patch` で届くようにしてある。
 * パッチが将来剥落したら **外部化が起きなくなるだけ**（＝現状維持）に倒すため、
 * `undefined` は「フレーム不明」として in-app に落とす。
 */
export function classifyLinkTarget(input: { url: string; isTopFrame?: boolean }): LinkTarget {
  if (input.isTopFrame !== true) return 'in-app'

  const url = input.url.trim()
  const scheme = SCHEME_RE.exec(url)?.[1].toLowerCase()
  if (!scheme) return 'in-app'
  if (HANDOFF_SCHEMES.includes(scheme)) return 'external'
  if (scheme !== 'http' && scheme !== 'https') return 'in-app'

  const host = hostOf(url)
  if (!host) return 'in-app'
  if (IN_APP_HOST_SUFFIXES.some((suffix) => matchesSuffix(host, suffix))) return 'in-app'
  if (SSO_URL_MARKERS.some((re) => re.test(url))) return 'in-app'
  return 'external'
}

/**
 * ホストが**許可リストそのもの**に載っているか（SSOマーカーの保険は通さない）。
 * 用途は**表示**＝アドレスバーの無いWebViewで「いま学外のページを見ている」と知らせるため。
 * ⚠`classifyLinkTarget` と結果が食い違うのは意図どおり＝あちらはマーカーでホスト未知も
 * in-app に通す（ログイン連鎖を切らないため）。**その「通した先」を利用者に見せるのがここ。**
 */
export function isKnownInAppHost(url: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  return IN_APP_HOST_SUFFIXES.some((suffix) => matchesSuffix(host, suffix))
}

