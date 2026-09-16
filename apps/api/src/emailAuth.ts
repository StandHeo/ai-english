import type { DatabaseSync } from 'node:sqlite'
import { assertCanSendAuthCode, upsertAuthCode, verifyAuthCode } from './authCodes.js'
import { issueEmailCodeValue, sendAuthEmail } from './mail.js'

export async function issueEmailCode(
  db: DatabaseSync,
  email: string,
): Promise<{ code: string; mock: boolean }> {
  assertCanSendAuthCode(db, 'email', email, 'email_rate_limited')
  const issued = issueEmailCodeValue()
  await sendAuthEmail(email, issued.code)
  upsertAuthCode(db, 'email', email, issued.code)
  return issued
}

export function verifyEmailCode(db: DatabaseSync, email: string, code: string): boolean {
  return verifyAuthCode(db, 'email', email, code)
}

export function authChannel(): 'email' | 'sms' {
  return process.env.AUTH_CHANNEL === 'sms' ? 'sms' : 'email'
}
