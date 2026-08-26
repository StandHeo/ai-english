import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAgnesRateLimiter,
  isAgnesHttp429,
  runAgnesCall,
} from './agnesRateLimit.ts'

test('limiter allows up to max then waits', async () => {
  let fakeNow = 1_000_000
  const sleeps: number[] = []
  const limiter = createAgnesRateLimiter({
    maxPerWindow: 3,
    windowMs: 1_000,
    now: () => fakeNow,
    sleep: async (ms) => {
      sleeps.push(ms)
      fakeNow += ms
    },
  })

  await limiter.acquire()
  await limiter.acquire()
  await limiter.acquire()
  assert.equal(limiter.pendingCount(), 3)
  assert.equal(sleeps.length, 0)

  const fourth = limiter.acquire()
  await fourth
  assert.ok(sleeps.length >= 1)
  assert.ok(sleeps[0]! > 0)
})

test('isAgnesHttp429 detects status in message', () => {
  assert.equal(isAgnesHttp429(new Error('agnes_image_http_429:slow down')), true)
  assert.equal(isAgnesHttp429(new Error('agnes_http_500:x')), false)
})

test('runAgnesCall retries once on 429', async () => {
  let calls = 0
  const limiter = createAgnesRateLimiter({
    maxPerWindow: 10,
    windowMs: 60_000,
    sleep: async () => undefined,
  })
  const result = await runAgnesCall(
    async () => {
      calls += 1
      if (calls === 1) throw new Error('agnes_http_429:rate')
      return 'ok'
    },
    limiter,
    async () => undefined,
  )
  assert.equal(result, 'ok')
  assert.equal(calls, 2)
})
