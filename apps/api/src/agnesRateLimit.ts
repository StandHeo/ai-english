/** Agnes 免费档约 20 RPM；默认 18/分钟留余量。chat 与 image 共用。 */

export type AgnesRateLimiter = {
  acquire: () => Promise<void>
  pendingCount: () => number
  reset: () => void
}

export type AgnesRateLimitOptions = {
  maxPerWindow?: number
  windowMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createAgnesRateLimiter(opts: AgnesRateLimitOptions = {}): AgnesRateLimiter {
  const maxPerWindow = opts.maxPerWindow ?? 18
  const windowMs = opts.windowMs ?? 60_000
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? defaultSleep
  const stamps: number[] = []
  let tail: Promise<void> = Promise.resolve()

  const acquire = (): Promise<void> => {
    const run = async () => {
      for (;;) {
        const t = now()
        while (stamps.length > 0 && t - stamps[0]! >= windowMs) {
          stamps.shift()
        }
        if (stamps.length < maxPerWindow) {
          stamps.push(now())
          return
        }
        const waitMs = Math.max(25, windowMs - (t - stamps[0]!) + 25)
        await sleep(waitMs)
      }
    }
    const next = tail.then(run, run)
    tail = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  return {
    acquire,
    pendingCount: () => stamps.length,
    reset: () => {
      stamps.length = 0
    },
  }
}

export const agnesRateLimit = createAgnesRateLimiter()

export function isAgnesHttp429(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /_http_429\b|:429\b|\b429\b/.test(msg) || /rate.?limit|too many requests/i.test(msg)
}

export async function runAgnesCall<T>(
  fn: () => Promise<T>,
  limiter: AgnesRateLimiter = agnesRateLimit,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<T> {
  await limiter.acquire()
  try {
    return await fn()
  } catch (first) {
    if (!isAgnesHttp429(first)) throw first
    await sleep(4_000)
    await limiter.acquire()
    return await fn()
  }
}
