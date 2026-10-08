import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseDashScopeText } from './paraformerProxy.ts'

describe('parseDashScopeText', () => {
  test('partial result', () => {
    const r = parseDashScopeText({
      header: { event: 'result-generated' },
      payload: { output: { sentence: { text: '今天', end_time: null, sentence_end: false } } },
    })
    assert.equal(r.event, 'result-generated')
    assert.equal(r.text, '今天')
    assert.equal(r.sentenceEnd, false)
  })

  test('final sentence', () => {
    const r = parseDashScopeText({
      header: { event: 'result-generated' },
      payload: {
        output: { sentence: { text: '今天去公园。', end_time: 1200, sentence_end: true } },
      },
    })
    assert.equal(r.sentenceEnd, true)
    assert.equal(r.text, '今天去公园。')
  })

  test('task-started', () => {
    const r = parseDashScopeText({ header: { event: 'task-started' }, payload: {} })
    assert.equal(r.event, 'task-started')
  })
})
