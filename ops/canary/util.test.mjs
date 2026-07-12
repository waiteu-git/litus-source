import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPayload } from './lib/notify.mjs'
import { fixturePath } from './lib/fixtures.mjs'

test('payload trims to 1900', () => {
  const p = buildPayload('x'.repeat(5000))
  assert.equal(p.content.length, 1900)
})

test('payload passes short message through', () => {
  const p = buildPayload('hello')
  assert.equal(p.content, 'hello')
})

test('fixture path is timestamped under canary-fixtures', () => {
  const d = new Date('2026-07-12T09:30:00Z')
  const p = fixturePath('bulletin', d)
  assert.match(p, /canary-fixtures[\\/]bulletin-20260712T093000Z\.html$/)
})
