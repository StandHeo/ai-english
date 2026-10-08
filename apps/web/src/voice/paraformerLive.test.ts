import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resampleTo16k } from './paraformerLive.ts'

describe('resampleTo16k', () => {
  test('identity at 16k', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1])
    const out = resampleTo16k(input, 16000)
    assert.equal(out.length, 4)
    assert.equal(out[1], 0.5)
  })

  test('downsamples 48k to 16k', () => {
    const input = new Float32Array(480)
    for (let i = 0; i < input.length; i++) input[i] = i / input.length
    const out = resampleTo16k(input, 48000)
    assert.ok(out.length >= 159 && out.length <= 161)
  })
})
