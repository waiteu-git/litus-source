#!/usr/bin/env node
/**
 * 焼く前に叩く検査（提供者の配るビルドで宛先を設定し忘れる事故を止める）。
 *
 *   node scripts/check-release-env.mjs [プロジェクトのルート（既定はカレント）]
 *
 * Expo CLI の `export:embed`（Android の bundleRelease・iOS の Release ビルドが呼ぶ）と同じ規則で
 * 環境を組み立てる: NODE_ENV=production として `.env.production.local` → `.env.local` → `.env.production`
 * → `.env` の順に優先し、シェルの環境変数が常に勝つ。`EXPO_NO_DOTENV` があれば `.env*` を読まない。
 * （根拠: node_modules/@expo/cli/build/src/export/embed/exportEmbedAsync.js の setNodeEnv→loadEnvFiles、
 *   node_modules/@expo/env/build/index.js の getFiles・loadEnvFiles）
 *
 * `EXPO_PUBLIC_RELEASE_STAGE=production` のとき、src/config/endpoints.ts の6つのどれかが空・未設定、
 * または形が違えば（checkReleaseEnv の注記）exit 1。**値は出力しない**（キー名だけ）。production 以外は検査せず exit 0（fork・開発版は未設定が正）。
 * 変数の展開（${VAR}）は扱わない（使っていない）。
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** src/config/endpoints.ts が読む6つ。増減したら両方とも直す（releaseEnv.test.ts が一致を見る）。 */
export const REQUIRED_KEYS = [
  'EXPO_PUBLIC_KILLSWITCH_URL',
  'EXPO_PUBLIC_FEEDBACK_URL',
  'EXPO_PUBLIC_SITE_URL',
  'EXPO_PUBLIC_CONTACT_EMAIL',
  'EXPO_PUBLIC_IOS_REVIEW_URL',
  'EXPO_PUBLIC_ANDROID_REVIEW_URL',
]

/** 優先度の高い順（@expo/env の getFiles と同じ・mode=production）。 */
const ENV_FILES = ['.env.production.local', '.env.local', '.env.production', '.env']

/** 最小の dotenv 解釈（KEY=VALUE・export 前置・引用符・行末コメント）。 */
export function parseDotenv(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2]
    const q = v[0]
    if ((q === '"' || q === "'" || q === '`') && v.indexOf(q, 1) > 0) {
      v = v.slice(1, v.indexOf(q, 1))
    } else {
      v = v.replace(/\s+#.*$/, '').trim()
    }
    out[m[1]] = v
  }
  return out
}

/** export:embed が見るのと同じ合成（シェルが勝つ・ファイルは優先度順で先勝ち）。 */
export function resolveReleaseEnv(root, systemEnv) {
  const merged = {}
  if (!systemEnv.EXPO_NO_DOTENV) {
    for (const name of [...ENV_FILES].reverse()) {
      const p = join(root, name)
      if (existsSync(p)) Object.assign(merged, parseDotenv(readFileSync(p, 'utf8')))
    }
  }
  for (const [k, v] of Object.entries(systemEnv)) if (v !== undefined) merged[k] = v
  return merged
}

/**
 * production のときだけ検査する。missing＝空・未設定のキー、invalid＝形が違うキー（どちらもキー名だけ）。
 * 形: URL は https:// で始まる（market:// 等は Play ストアの無い端末で開けない・平文は無効）、
 * メールは @ を含む、iOS の評価ページは「レビューを書く」へ直接開く action=write-review を含む、Android の評価ページは app.json のパッケージ名（androidPackage）を id= に含む。
 */
export function checkReleaseEnv(env, { androidPackage = null } = {}) {
  const stage = env.EXPO_PUBLIC_RELEASE_STAGE === 'production' ? 'production' : 'other'
  if (stage !== 'production') return { stage, missing: [], invalid: [] }
  const val = (k) => (env[k] ?? '').trim()
  const missing = REQUIRED_KEYS.filter((k) => val(k) === '')
  const invalid = REQUIRED_KEYS.filter((k) => {
    const v = val(k)
    if (v === '') return false
    if (k === 'EXPO_PUBLIC_CONTACT_EMAIL') return !/^[^@\s]+@[^@\s]+$/.test(v)
    if (!v.startsWith('https://')) return true
    if (k === 'EXPO_PUBLIC_IOS_REVIEW_URL') return !v.includes('action=write-review')
    if (k === 'EXPO_PUBLIC_ANDROID_REVIEW_URL' && androidPackage) return !v.includes(`id=${androidPackage}`)
    return false
  })
  return { stage, missing, invalid }
}

function readAndroidPackage(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo?.android?.package ?? null
  } catch {
    return null
  }
}

function main() {
  const root = resolve(process.argv[2] ?? process.cwd())
  const { stage, missing, invalid } = checkReleaseEnv(resolveReleaseEnv(root, process.env), {
    androidPackage: readAndroidPackage(root),
  })
  if (stage !== 'production') {
    console.log('check-release-env: EXPO_PUBLIC_RELEASE_STAGE が production ではないため検査しません。')
    return 0
  }
  if (missing.length > 0 || invalid.length > 0) {
    if (missing.length > 0) {
      console.error('check-release-env: production なのに次の宛先が未設定です（.env に書く・説明は .env.example）:')
      for (const k of missing) console.error(`  - ${k}`)
    }
    if (invalid.length > 0) {
      console.error('check-release-env: 次の宛先の形が違います（https:// で始まる・メールは @ を含む・iOS は action=write-review・Android はパッケージ名を含む）:')
      for (const k of invalid) console.error(`  - ${k}`)
    }
    return 1
  }
  console.log(`check-release-env: OK（production・${REQUIRED_KEYS.length}つの宛先がすべて設定済み）`)
  return 0
}

// 直接叩かれた時だけ動く（テストから import しても main は走らない）。
const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (invokedDirectly) process.exit(main())
