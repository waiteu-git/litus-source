import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const BULLETIN_TABS_FIXTURE = readFileSync(
  fileURLToPath(new URL('./bulletin-tabs.html', import.meta.url)),
  'utf-8',
)
