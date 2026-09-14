import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

export function randomId(): string {
  return randomBytes(16).toString('hex')
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function randomSmsCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000
  return String(n).padStart(6, '0')
}
