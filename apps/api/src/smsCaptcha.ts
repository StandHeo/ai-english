import { randomBytes } from 'node:crypto'
import { sha256Hex, timingSafeEqualStr } from './cryptoUtil.js'

const CAPTCHA_TTL_MS = 5 * 60_000

type CaptchaRow = {
  answerHash: string
  expiresAt: number
}

const challenges = new Map<string, CaptchaRow>()

export function resetSmsCaptcha(): void {
  challenges.clear()
}

function envFlagOn(name: string): boolean {
  const v = (process.env[name] || '').trim().toLowerCase()
  return v === 'on' || v === 'true' || v === '1'
}

/** AUTH_CAPTCHA or legacy SMS_CAPTCHA: either switch enables captcha for both channels. */
export function authCaptchaEnabled(): boolean {
  return envFlagOn('AUTH_CAPTCHA') || envFlagOn('SMS_CAPTCHA')
}

export function smsCaptchaEnabled(): boolean {
  return authCaptchaEnabled()
}

function pruneExpired(now = Date.now()): void {
  for (const [id, row] of challenges) {
    if (row.expiresAt <= now) challenges.delete(id)
  }
}

function randomDigits(len: number): string {
  const buf = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += String(buf[i] % 10)
  return out
}

function renderDigitSvg(digits: string): string {
  const noise = Array.from({ length: 6 }, (_, i) => {
    const x1 = 8 + ((i * 23) % 120)
    const y1 = 6 + ((i * 11) % 36)
    const x2 = 20 + ((i * 31) % 110)
    const y2 = 10 + ((i * 17) % 32)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d8cbb8" stroke-width="1"/>`
  }).join('')
  const texts = [...digits].map((d, i) => {
    const x = 18 + i * 28
    const y = 34 + (i % 2 === 0 ? -3 : 3)
    const rot = ((i * 11) % 15) - 7
    return `<text x="${x}" y="${y}" font-size="26" font-family="Georgia, serif" fill="#2c241c" transform="rotate(${rot} ${x} ${y})">${d}</text>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="48" viewBox="0 0 140 48"><rect width="140" height="48" fill="#f6efe6"/>${noise}${texts}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

export function createSmsCaptcha(): { id: string; image: string; ttlMs: number } {
  pruneExpired()
  const id = randomBytes(16).toString('hex')
  const answer = randomDigits(4)
  challenges.set(id, {
    answerHash: sha256Hex(`${id}:${answer}`),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  })
  return { id, image: renderDigitSvg(answer), ttlMs: CAPTCHA_TTL_MS }
}

export function consumeSmsCaptcha(id: string, answer: string): boolean {
  pruneExpired()
  const key = String(id || '').trim()
  const row = challenges.get(key)
  if (!row) return false
  challenges.delete(key)
  if (row.expiresAt <= Date.now()) return false
  const normalized = String(answer || '').trim()
  if (!normalized) return false
  return timingSafeEqualStr(row.answerHash, sha256Hex(`${key}:${normalized}`))
}
