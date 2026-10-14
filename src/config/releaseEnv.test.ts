import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeEndpoint } from './endpoints'

/**
 * 提供者の配る production ビルドで宛先を設定し忘れる事故を止めるラチェット。
 * 設定し忘れると、そのビルドからキルスイッチが黙って消える（大学への「24時間以内に止める」約束が守れない）。
 *
 * 1. 焼く前の検査 `scripts/check-release-env.mjs` を実際に叩いて、production で欠け・形違いを exit 1 で止め、
 *    値を出力しないことを確かめる（.env の読み方は Expo CLI の export:embed と同じ）。
 * 2. このリポジトリの今の環境（シェル＋.env*）で焼いたら通るか、をそのまま検査する。
 *    素の `pnpm test` は production ではないので素通り。`.env` に production を書いた手元で回すと効く。
 */
const ROOT = join(__dirname, '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'check-release-env.mjs')

/** スクリプトが列挙する6つ（スクリプトの REQUIRED_KEYS を文字列から読む＝二重管理のずれを下で検出する）。 */
const SCRIPT_KEYS: string[] = (() => {
  const src = readFileSync(SCRIPT, 'utf8')
  const block = src.match(/export const REQUIRED_KEYS = \[([\s\S]*?)\]/)
  return block ? [...block[1].matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]) : []
})()

const FULL: Record<string, string> = {
  EXPO_PUBLIC_RELEASE_STAGE: 'production',
  EXPO_PUBLIC_KILLSWITCH_URL: 'https://ks.example.com/status.json',
  EXPO_PUBLIC_FEEDBACK_URL: 'https://api.example.com/api/feedback',
  EXPO_PUBLIC_SITE_URL: 'https://site.example.com/',
  EXPO_PUBLIC_CONTACT_EMAIL: 'contact@example.com',
  EXPO_PUBLIC_IOS_REVIEW_URL: 'https://apps.example.com/app/id1?action=write-review',
  EXPO_PUBLIC_ANDROID_REVIEW_URL: 'https://play.example.com/store/apps/details?id=example.app',
}

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** 一時ディレクトリに .env* と app.json を置いてスクリプトを叩く。シェル側の EXPO_PUBLIC_* は落とす。 */
function run(files: Record<string, string>, shell: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'litus-relenv-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { android: { package: 'example.app' } } }))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('EXPO_PUBLIC_') && k !== 'EXPO_NO_DOTENV' && k !== '__EXPO_ENV_LOADED') env[k] = v
  }
  const r = spawnSync(process.execPath, [SCRIPT, dir], { env: { ...env, ...shell } as NodeJS.ProcessEnv, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}

const dotenv = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

const without = (key: string) => Object.fromEntries(Object.entries(FULL).filter(([k]) => k !== key))

describe('scripts/check-release-env.mjs（焼く前の検査）', () => {
  it('計器の陽性対照: スクリプトの6つを読めている', () => {
    expect(SCRIPT_KEYS).toHaveLength(6)
    expect(SCRIPT_KEYS).toContain('EXPO_PUBLIC_KILLSWITCH_URL')
  })

  it('production で6つそろっていれば exit 0', () => {
    expect(run({ '.env': dotenv(FULL) }).code).toBe(0)
  })

  it.each(SCRIPT_KEYS)('production で %s が欠けたら exit 1（キー名だけ出し、値は出さない）', (key) => {
    const r = run({ '.env': dotenv(without(key)) })
    expect(r.code).toBe(1)
    expect(r.out).toContain(key)
    for (const [k, v] of Object.entries(FULL)) if (k !== 'EXPO_PUBLIC_RELEASE_STAGE') expect(r.out).not.toContain(v)
  })

  it('空文字・空白だけも欠けと同じ', () => {
    expect(run({ '.env': dotenv({ ...FULL, EXPO_PUBLIC_KILLSWITCH_URL: '' }) }).code).toBe(1)
    expect(run({ '.env': dotenv({ ...FULL, EXPO_PUBLIC_KILLSWITCH_URL: '"  "' }) }).code).toBe(1)
  })

  it('形違い（https でない・market://・@ の無いメール・write-review 無し・パッケージ名違い）は exit 1', () => {
    for (const bad of [
      { EXPO_PUBLIC_KILLSWITCH_URL: 'http://ks.example.com/status.json' },
      { EXPO_PUBLIC_ANDROID_REVIEW_URL: 'market://details?id=example.app' },
      { EXPO_PUBLIC_ANDROID_REVIEW_URL: 'https://play.example.com/store/apps/details?id=other.app' },
      { EXPO_PUBLIC_CONTACT_EMAIL: 'contact' },
      { EXPO_PUBLIC_IOS_REVIEW_URL: 'https://apps.example.com/app/id1' },
    ] as Record<string, string>[]) {
      const r = run({ '.env': dotenv({ ...FULL, ...bad }) })
      expect(r.code, JSON.stringify(bad)).toBe(1)
      expect(r.out).not.toContain(Object.values(bad)[0])
    }
  })

  it('production 以外（beta・dev・未設定）は検査しない＝欠けていても exit 0（fork・開発版は未設定が正）', () => {
    expect(run({ '.env': 'EXPO_PUBLIC_RELEASE_STAGE=beta' }).code).toBe(0)
    expect(run({}).code).toBe(0)
  })

  it('シェルの production も拾う（.env が無くても欠けを止める）', () => {
    expect(run({}, { EXPO_PUBLIC_RELEASE_STAGE: 'production' }).code).toBe(1)
    expect(run({}, FULL).code).toBe(0)
  })

  it('export:embed と同じ合成: .env.production・.env.local も読み、シェルの値が .env より勝つ', () => {
    expect(run({ '.env': 'EXPO_PUBLIC_RELEASE_STAGE=production', '.env.production': dotenv(FULL) }).code).toBe(0)
    expect(run({ '.env.local': dotenv(FULL) }).code).toBe(0)
    // シェルで空にすると .env の値は使われない（Expo は既存の環境変数を上書きしない）
    expect(run({ '.env': dotenv(FULL) }, { EXPO_PUBLIC_KILLSWITCH_URL: '' }).code).toBe(1)
  })

  it('EXPO_NO_DOTENV があれば .env* を読まない（export:embed と同じ）', () => {
    expect(run({ '.env': dotenv(FULL) }, { EXPO_NO_DOTENV: '1', EXPO_PUBLIC_RELEASE_STAGE: 'production' }).code).toBe(1)
  })
})

describe('このリポジトリの今の環境で焼いたら通るか（ラチェット）', () => {
  it('scripts/check-release-env.mjs が通る（production でなければ素通り）', () => {
    const r = spawnSync(process.execPath, [SCRIPT, ROOT], { encoding: 'utf8' })
    expect(r.status, '焼く前に .env の宛先を埋めること（キー名は .env.example）').toBe(0)
  })

  it('テストを production で回しているなら、キルスイッチの宛先が入っている', () => {
    if (process.env.EXPO_PUBLIC_RELEASE_STAGE !== 'production') return
    expect(normalizeEndpoint(process.env.EXPO_PUBLIC_KILLSWITCH_URL)).not.toBeNull()
  })
})
