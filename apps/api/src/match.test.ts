import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchExpect, normalizeSpeech } from './match.js'

test('normalize strips punctuation', () => {
  assert.equal(normalizeSpeech('Apple!'), 'apple')
  assert.equal(normalizeSpeech('  An apple. '), 'an apple')
})

test('exact expect matches', () => {
  assert.equal(matchExpect('apple', ['apple', 'an apple']), true)
  assert.equal(matchExpect('An Apple!', ['apple']), true)
})

test('contains whole-word expect', () => {
  assert.equal(matchExpect('it is an apple', ['apple']), true)
  assert.equal(matchExpect('pineapple', ['apple']), false)
})

test('rejects unrelated', () => {
  assert.equal(matchExpect('banana', ['apple']), false)
  assert.equal(matchExpect('', ['apple']), false)
})
