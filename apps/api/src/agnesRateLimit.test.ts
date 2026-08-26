import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAgnesRateLimiter,
  isAgnesHttp429,
  runAgnesCall,
} from './agnesRateLimit.ts'

test('api limiter queues after max', async () => {
  let fakeNow = 5_000_000
  const sleeps: number[] = []
  const limiter = createAgnesRateLimiter({
    maxPerWindow: 2,
    windowMs: 500,
    now: () => fakeNow,
    sleep: async (ms) => {
      sleeps.push(ms)
      fakeNow += ms
    },
  })
  await limiter.acquire()
  await limiter.acquire()
  await limiter.acquire()
  assert.ok(sleeps.length >= 1)
})

test('api isAgnesHttp429', () => {
  assert.equal(isAgnesHttp429(new Error('llm_http_429:x')), true)
})

test('api runAgnesCall retries 429', async () => {
  let n = 0
  const limiter = createAgnesRateLimiter({ maxPerWindow: 20, sleep: async () => undefined })
  const out = await runAgnesCall(
    async () => {
      n += 1
      if (n === 1) throw new Error('agnes_image_http_429')
      return 1
    },
    limiter,
    async () => undefined,
  )
  assert.equal(out, 1)
  assert.equal(n, 2)
})
