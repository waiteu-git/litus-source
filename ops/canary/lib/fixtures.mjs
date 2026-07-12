// structure_drift 時に生HTMLを ~/ops/canary-fixtures/<面>-<UTCstamp>.html に保存する。
// 開発者が後で litus の __fixtures__/ に投入し、回帰テスト→パーサ修正の素材にする。
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

function stamp(d) {
  // 2026-07-12T09:30:00.000Z -> 20260712T093000Z
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
}

export function fixturePath(surface, date) {
  const dir = process.env.CANARY_FIXTURES || join(homedir(), 'ops', 'canary-fixtures')
  return join(dir, `${surface}-${stamp(date)}.html`)
}

export function saveFixture(surface, html, date) {
  const p = fixturePath(surface, date)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, html)
  return p
}
