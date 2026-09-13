import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(relPath: string): string {
  return readFileSync(join(__dirname, '..', '..', relPath), 'utf8')
}

test('navigation/types.tsのBulletinルートがinitialTabを受け取れる', () => {
  const src = readSource('src/navigation/types.ts')
  expect(src).toMatch(/Bulletin:\s*\{\s*initialTab\?:\s*'schedule'\s*\}\s*\|\s*undefined/)
})

test('BulletinListScreen.tsxがroute.params.initialTabを初期タブに使う', () => {
  const src = readSource('src/screens/BulletinListScreen.tsx')
  expect(src).toContain('useRoute')
  expect(src).toMatch(/useState<Tab>\(route\.params\?\.initialTab\s*\?\?\s*'unread'\)/)
})

test('HomeScreen.tsxが休講/補講/教室変更の通知行を配線している', () => {
  const src = readSource('src/screens/HomeScreen.tsx')
  expect(src).toContain('countScheduleNotices(')
  expect(src).toContain('formatScheduleNoticeLabel(')
  expect(src).toContain('findSingleScheduleNotice(')
  expect(src).toContain('ui.colors.infoBg')
  expect(src).toMatch(/navigation\.navigate\('Bulletin',\s*\{\s*initialTab:\s*'schedule'\s*\}\)/)
  expect(src).toMatch(/navigation\.navigate\('BulletinDetail',\s*\{\s*id:\s*only\.id\s*\}\)/)
})

test('通知行はscheduleNoticeという独立したホームセクションに属する（bulletinsセクションの中ではない）', () => {
  const src = readSource('src/screens/HomeScreen.tsx')
  expect(src).toMatch(/scheduleNotice:\s*scheduleNoticeLabel\s*\?/)
})

test('scheduleNoticeはHomeSectionKeyに登録され、fixedOnである', () => {
  const src = readSource('src/home/homeSections.ts')
  expect(src).toContain("'scheduleNotice'")
  expect(src).toMatch(/scheduleNotice:\s*\{\s*label:\s*'[^']+',\s*fixedOn:\s*true\s*\}/)
})
