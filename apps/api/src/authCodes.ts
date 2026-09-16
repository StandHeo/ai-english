import type { DatabaseSync } from 'node:sqlite'
import { sha256Hex, timingSafeEqualStr } from './cryptoUtil.js'

export const AUTH_SEND_INTERVAL_MS = 60_000
export const AUTH_CODE_TTL_MS = 5 * 60_000
export const AUTH_MAX_ATTEMPTS = 5

export type AuthChannel = 'email' | 'sms'

export type AuthCodeRow = {
  channel: AuthChannel
  destination: string
  code_hash: string
  expires_at: string
  attempts: number
  sent_at: string
}

export function getAuthRow(
  db: DatabaseSync,
  channel: AuthChannel,
  destination: string,
): AuthCodeRow | undefined {
  return db
    .prepare(
      `SELECT channel, destination, code_hash, expires_at, attempts, sent_at
       FROM auth_codes WHERE channel = ? AND destination = ?`,
    )
    .get(channel, destination) as AuthCodeRow | undefined
}

export function assertCanSendAuthCode(
  db: DatabaseSync,
  channel: AuthChannel,
  destination: string,
  rateError: string,
): void {
  const existing = getAuthRow(db, channel, destination)
  if (existing && Date.now() - Date.parse(existing.sent_at) < AUTH_SEND_INTERVAL_MS) {
    throw new Error(rateError)
  }
}

export function upsertAuthCode(
  db: DatabaseSync,
  channel: AuthChannel,
  destination: string,
  code: string,
  now = Date.now(),
): void {
  db.prepare(
    `INSERT INTO auth_codes (channel, destination, code_hash, expires_at, attempts, sent_at)
     VALUES (?, ?, ?, ?, 0, ?)
     ON CONFLICT(channel, destination) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       sent_at = excluded.sent_at`,
  ).run(
    channel,
    destination,
    sha256Hex(code),
    new Date(now + AUTH_CODE_TTL_MS).toISOString(),
    new Date(now).toISOString(),
  )
}

export function verifyAuthCode(
  db: DatabaseSync,
  channel: AuthChannel,
  destination: string,
  code: string,
): boolean {
  const row = getAuthRow(db, channel, destination)
  if (!row) return false
  if (Date.parse(row.expires_at) <= Date.now()) return false
  if (row.attempts >= AUTH_MAX_ATTEMPTS) return false
  const ok = timingSafeEqualStr(row.code_hash, sha256Hex(String(code || '').trim()))
  if (!ok) {
    db.prepare(
      'UPDATE auth_codes SET attempts = attempts + 1 WHERE channel = ? AND destination = ?',
    ).run(channel, destination)
    return false
  }
  db.prepare('DELETE FROM auth_codes WHERE channel = ? AND destination = ?').run(channel, destination)
  return true
}

export function deleteAuthCodesForDestinations(
  db: DatabaseSync,
  dest: { email?: string | null; phone?: string | null },
): void {
  if (dest.email) {
    db.prepare('DELETE FROM auth_codes WHERE channel = ? AND destination = ?').run('email', dest.email)
  }
  if (dest.phone) {
    db.prepare('DELETE FROM auth_codes WHERE channel = ? AND destination = ?').run('sms', dest.phone)
  }
}
