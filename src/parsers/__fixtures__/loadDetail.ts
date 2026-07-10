import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const BULLETIN_DETAIL_FIXTURE = readFileSync(
  fileURLToPath(new URL('./bulletin-detail.html', import.meta.url)),
  'utf-8',
)
