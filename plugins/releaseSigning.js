/**
 * android/app/build.gradle の release ビルドに「アップロード鍵」の署名設定を差し込む純粋関数。
 * config plugin 本体（withReleaseSigning.js）から切り離してあるのは、expo/config-plugins を
 * 読み込まずに vitest から検証できるようにするため（supportsRtl.js と同じ作法）。
 *
 * なぜ plugin が要るか: `android/` は .gitignore 済みの生成物で、prebuild のたびに
 * Expo テンプレートから作り直される。テンプレートの release は `signingConfigs.debug`
 * （storePassword 'android' の公開鍵）を指しており、手で直しても次の prebuild で消える。
 *
 * 秘密の供給経路: 鍵のパスとパスワードは **リポジトリにも app.json にも置かない**。
 * Gradle がプロパティを読む正規の供給源（-P / -D / ORG_GRADLE_PROJECT_* 環境変数 /
 * GRADLE_USER_HOME・プロジェクト直下・GRADLE_HOME の gradle.properties）から渡す。
 * 任意パスの .properties を Gradle が勝手に読むことはない（過去の設計はここで破綻した）。
 *
 * プロパティ未設定なら **debug 署名のまま**にフォールバックする。ベータのローカルビルド
 * （`./gradlew assembleRelease`）を今までどおり動かし続けるため＝鍵を持たない環境でも壊れない。
 */

const STORE_FILE_PROP = 'LITUS_UPLOAD_STORE_FILE'
const MARKER = STORE_FILE_PROP

/** `header` から始まるブロックの範囲を波括弧の対応で求める。見つからなければ null。 */
function blockRange(src, header, from = 0) {
  const start = src.indexOf(header, from)
  if (start < 0) return null
  const open = src.indexOf('{', start)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return { start, open, end: i }
    }
  }
  return null
}

/** signingConfigs ブロックの末尾へ release 署名設定を足す。 */
function addReleaseSigningConfig(src) {
  const sc = blockRange(src, 'signingConfigs')
  if (!sc) throw new Error('build.gradle に signingConfigs ブロックが見つからない')
  const block = [
    '        release {',
    '            // 値は ORG_GRADLE_PROJECT_* 環境変数か gradle.properties から供給する。',
    '            // 鍵の実体・パスワードはリポジトリにもこのファイルにも置かない。',
    `            if (project.hasProperty('${STORE_FILE_PROP}')) {`,
    `                storeFile file(${STORE_FILE_PROP})`,
    '                storePassword LITUS_UPLOAD_STORE_PASSWORD',
    '                keyAlias LITUS_UPLOAD_KEY_ALIAS',
    '                keyPassword LITUS_UPLOAD_KEY_PASSWORD',
    '            }',
    '        }',
    '',
  ].join('\n')
  // 閉じ括弧のある行の先頭へ入れる（閉じ括弧の直前に足すと、その行のインデントが
  // 差し込んだブロックの前に残って生成物の桁が崩れる）。
  const lineStart = src.lastIndexOf('\n', sc.end) + 1
  return src.slice(0, lineStart) + block + src.slice(lineStart)
}

/**
 * buildTypes の release だけを対象に、署名先をプロパティ有無で切り替える。
 * debug ビルドタイプ側の `signingConfig signingConfigs.debug` は触らない
 * （テンプレートには同じ行が2箇所あるため、release ブロックの範囲内に限定して置換する）。
 */
function pointReleaseBuildType(src) {
  const bt = blockRange(src, 'buildTypes')
  if (!bt) throw new Error('build.gradle に buildTypes ブロックが見つからない')
  const rel = blockRange(src, 'release', bt.open)
  if (!rel || rel.end > bt.end) throw new Error('buildTypes に release ブロックが見つからない')
  const target = 'signingConfig signingConfigs.debug'
  const at = src.indexOf(target, rel.open)
  if (at < 0 || at > rel.end) throw new Error('release の signingConfig 行が見つからない')
  const replacement =
    `signingConfig project.hasProperty('${STORE_FILE_PROP}') ? signingConfigs.release : signingConfigs.debug`
  return src.slice(0, at) + replacement + src.slice(at + target.length)
}

/**
 * 適用済みなら何もしない（prebuild は毎回テンプレートから作るので通常は未適用だが、
 * 二重適用しても壊れないようにしておく）。
 */
function applyUploadSigning(src) {
  if (src.includes(MARKER)) return src
  return pointReleaseBuildType(addReleaseSigningConfig(src))
}

module.exports = { applyUploadSigning, STORE_FILE_PROP }
