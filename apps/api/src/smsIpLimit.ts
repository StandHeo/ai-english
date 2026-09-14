import type { Request } from 'express'

const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_SEND_MAX = 10
const DEFAULT_VERIFY_MAX = 30
const DAY_MS = 24 * 60 * 60 * 1000

const windowHits = new Map<string, number[]>()
const dailyHits = new Map<string, number[]>()

export function resetSmsIpLimiter(): void {
  windowHits.clear()
  dailyHits.clear()
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

export function trustProxySetting(): boolean | number | string | undefined {
  const raw = (process.env.TRUST_PROXY ?? '1').trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'off') return undefined
  if (raw === 'true' || raw === 'on' || raw === '1') return 1
  if (/^\d+$/.test(raw)) return Number(raw)
  return process.env.TRUST_PROXY!.trim()
}

export function isTrustProxyEnabled(): boolean {
  return trustProxySetting() !== undefined
}

export function normalizeIp(ip: string): string {
  const v = ip.trim()
  if (!v) return 'unknown'
  if (v.startsWith('::ffff:')) return v.slice(7)
  return v
}

export function clientIp(req: Request): string {
  if (isTrustProxyEnabled()) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      ?.trim()
    if (forwarded) return normalizeIp(forwarded)
    const real = String(req.headers['x-real-ip'] || '').trim()
    if (real) return normalizeIp(real)
    if (typeof req.ip === 'string' && req.ip.trim()) return normalizeIp(req.ip)
  }
  const socket = req.socket?.remoteAddress || ''
  if (socket) return normalizeIp(socket)
  if (typeof req.ip === 'string' && req.ip.trim()) return normalizeIp(req.ip)
  return 'unknown'
}

function prune(hits: number[], since: number): number[] {
  return hits.filter((t) => t > since)
}

function takeSlot(map: Map<string, number[]>, key: string, now: number, windowMs: number, max: number): boolean {
  const hits = prune(map.get(key) || [], now - windowMs)
  if (hits.length >= max) {
    map.set(key, hits)
    return false
  }
  hits.push(now)
  map.set(key, hits)
  return true
}

export function consumeSmsIpLimit(ip: string, kind: 'send' | 'verify'): 'ok' | 'limited' {
  const now = Date.now()
  const windowMs = envInt('SMS_IP_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS)
  const max = kind === 'send' ? envInt('SMS_IP_LIMIT_MAX', DEFAULT_SEND_MAX) : envInt('SMS_VERIFY_IP_LIMIT_MAX', DEFAULT_VERIFY_MAX)
  if (max > 0 && !takeSlot(windowHits, `${kind}:${ip}`, now, windowMs, max)) return 'limited'

  if (kind === 'send') {
    const dailyMax = envInt('SMS_IP_DAILY_MAX', 0)
    if (dailyMax > 0 && !takeSlot(dailyHits, ip, now, DAY_MS, dailyMax)) return 'limited'
  }
  return 'ok'
}
