import { createHmac, createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { randomSmsCode, sha256Hex, timingSafeEqualStr } from './cryptoUtil.js'

const SEND_INTERVAL_MS = 60_000
const CODE_TTL_MS = 5 * 60_000
const MAX_ATTEMPTS = 5

export function smsProvider(): 'mock' | 'tencent' {
  return process.env.SMS_PROVIDER === 'tencent' ? 'tencent' : 'mock'
}

export function mockSmsCode(): string {
  const raw = (process.env.MOCK_SMS_CODE || '123456').trim()
  return /^\d{4,8}$/.test(raw) ? raw : '123456'
}

type SmsRow = {
  phone: string
  code_hash: string
  expires_at: string
  attempts: number
  sent_at: string
}

export function getSmsRow(db: DatabaseSync, phone: string): SmsRow | undefined {
  return db
    .prepare('SELECT phone, code_hash, expires_at, attempts, sent_at FROM sms_codes WHERE phone = ?')
    .get(phone) as SmsRow | undefined
}

export async function issueSmsCode(db: DatabaseSync, phone: string): Promise<{ code: string; mock: boolean }> {
  const existing = getSmsRow(db, phone)
  if (existing && Date.now() - Date.parse(existing.sent_at) < SEND_INTERVAL_MS) {
    const err = new Error('sms_rate_limited')
    throw err
  }
  const provider = smsProvider()
  const code = provider === 'mock' ? mockSmsCode() : randomSmsCode()
  if (provider === 'tencent') {
    await sendTencentSms(phone, code)
  } else {
    console.log(`[sms/mock] phone=${phone} code=${code}`)
  }
  const now = Date.now()
  db.prepare(
    `INSERT INTO sms_codes (phone, code_hash, expires_at, attempts, sent_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(phone) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       sent_at = excluded.sent_at`,
  ).run(phone, sha256Hex(code), new Date(now + CODE_TTL_MS).toISOString(), new Date(now).toISOString())
  return { code, mock: provider === 'mock' }
}

export function verifySmsCode(db: DatabaseSync, phone: string, code: string): boolean {
  const row = getSmsRow(db, phone)
  if (!row) return false
  if (Date.parse(row.expires_at) <= Date.now()) return false
  if (row.attempts >= MAX_ATTEMPTS) return false
  const ok = timingSafeEqualStr(row.code_hash, sha256Hex(String(code || '').trim()))
  if (!ok) {
    db.prepare('UPDATE sms_codes SET attempts = attempts + 1 WHERE phone = ?').run(phone)
    return false
  }
  db.prepare('DELETE FROM sms_codes WHERE phone = ?').run(phone)
  return true
}

export function tencentSmsConfigured(): boolean {
  return Boolean(
    process.env.TENCENT_SMS_SECRET_ID?.trim() &&
      process.env.TENCENT_SMS_SECRET_KEY?.trim() &&
      process.env.TENCENT_SMS_SDK_APP_ID?.trim() &&
      process.env.TENCENT_SMS_SIGN_NAME?.trim() &&
      process.env.TENCENT_SMS_TEMPLATE_ID?.trim(),
  )
}

function sha256HexUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmacBuf(key: Buffer | string, msg: string): Buffer {
  return createHmac('sha256', key).update(msg, 'utf8').digest()
}

export async function sendTencentSms(phone: string, code: string): Promise<void> {
  if (!tencentSmsConfigured()) {
    throw new Error('sms_tencent_not_configured')
  }
  const secretId = process.env.TENCENT_SMS_SECRET_ID!.trim()
  const secretKey = process.env.TENCENT_SMS_SECRET_KEY!.trim()
  const sdkAppId = process.env.TENCENT_SMS_SDK_APP_ID!.trim()
  const signName = process.env.TENCENT_SMS_SIGN_NAME!.trim()
  const templateId = process.env.TENCENT_SMS_TEMPLATE_ID!.trim()
  const region = (process.env.TENCENT_SMS_REGION || 'ap-guangzhou').trim()

  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [code],
  })
  const host = 'sms.tencentcloudapi.com'
  const service = 'sms'
  const action = 'SendSms'
  const version = '2021-01-11'
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const hashedPayload = sha256HexUtf8(payload)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, sha256HexUtf8(canonicalRequest)].join(
    '\n',
  )
  const secretDate = hmacBuf(`TC3${secretKey}`, date)
  const secretService = hmacBuf(secretDate, service)
  const secretSigning = hmacBuf(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      'X-TC-Region': region,
    },
    body: payload,
  })
  const data = (await res.json().catch(() => ({}))) as {
    Response?: { Error?: { Code?: string; Message?: string } }
  }
  if (!res.ok || data.Response?.Error) {
    const codeName = data.Response?.Error?.Code || `http_${res.status}`
    throw new Error(`sms_tencent_failed:${codeName}`)
  }
}
