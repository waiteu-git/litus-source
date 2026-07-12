// ~/ops/ops.env（既存 ops と共用）を素朴パースして環境値を返す。値のシングルクォートは剥がす。
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function loadEnv() {
  const f = process.env.OPS_ENV || join(homedir(), 'ops', 'ops.env')
  const out = {}
  if (!existsSync(f)) return out
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*'?([^'\n]*)'?\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
