import test from 'node:test'
import assert from 'node:assert/strict'
import { isInlineImageRef, newImageId } from './imageDb.ts'

test('isInlineImageRef detects data URLs and huge strings', () => {
  assert.equal(isInlineImageRef('data:image/jpeg;base64,abc'), true)
  assert.equal(isInlineImageRef('https://cdn.example/a.png'), false)
  assert.equal(isInlineImageRef('x'.repeat(3000)), true)
  assert.equal(isInlineImageRef('short'), false)
})

test('newImageId is unique-ish', () => {
  const a = newImageId('bg')
  const b = newImageId('bg')
  assert.notEqual(a, b)
  assert.match(a, /^bg_/)
})
