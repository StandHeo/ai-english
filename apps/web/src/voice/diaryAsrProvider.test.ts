import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import {
  DEFAULT_DIARY_ASR_PROVIDER,
  getDiaryAsrProvider,
  isDiaryAsrProvider,
  setDiaryAsrProvider,
} from './diaryAsrProvider.ts'

const mem = new Map<string, string>()

describe('diaryAsrProvider', () => {
  afterEach(() => {
    mem.clear()
  })

  test('type guard', () => {
    assert.equal(isDiaryAsrProvider('on-device'), true)
    assert.equal(isDiaryAsrProvider('paraformer-v2'), true)
    assert.equal(isDiaryAsrProvider('openai'), false)
  })

  test('round-trip preference', () => {
    // jsdom-less: stub localStorage for this module via global
    const store: Storage = {
      get length() {
        return mem.size
      },
      clear() {
        mem.clear()
      },
      getItem(k) {
        return mem.has(k) ? mem.get(k)! : null
      },
      key() {
        return null
      },
      removeItem(k) {
        mem.delete(k)
      },
      setItem(k, v) {
        mem.set(k, String(v))
      },
    }
    Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true })

    assert.equal(getDiaryAsrProvider(), DEFAULT_DIARY_ASR_PROVIDER)
    setDiaryAsrProvider('paraformer-v2')
    assert.equal(getDiaryAsrProvider(), 'paraformer-v2')
    setDiaryAsrProvider('on-device')
    assert.equal(getDiaryAsrProvider(), 'on-device')
  })
})
