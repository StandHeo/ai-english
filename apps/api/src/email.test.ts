import assert from 'node:assert/strict'
import { test } from 'node:test'
import { maskEmail, normalizeEmail } from './email.js'

test('normalizeEmail lowercases and rejects junk', () => {
  assert.equal(normalizeEmail('  Parent@Example.COM '), 'parent@example.com')
  assert.equal(normalizeEmail('not-an-email'), null)
  assert.equal(normalizeEmail('a@b'), null)
  assert.equal(normalizeEmail(''), null)
})

test('maskEmail keeps first local char', () => {
  assert.equal(maskEmail('parent@example.com'), 'p***@example.com')
})
