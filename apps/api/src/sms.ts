import { createHmac, createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { assertCanSendAuthCode, upsertAuthCode, verifyAuthCode } from './authCodes.js'
import { randomSmsCode } from './cryptoUtil.js'

export function smsProvider(): 'mock' | 'tencent' {
  return process.env.SMS_PROVIDER === 'tencent' ? 'tencent' : 'mock'
}

export function mockSmsCode(): string {
  const raw = (process.env.MOCK_SMS_CODE || '123456').trim()
  return /^\d{4,8}$/.test(raw) ? raw : '123456'
}

export async function issueSmsCode(db: DatabaseSync, phone: string): Promise<{ code: string; mock: boolean }> {
  assertCanSendAuthCode(db, 'sms', phone, 'sms_rate_limited')
  const provider = smsProvider()
  const code = provider === 'mock' ? mockSmsCode() : randomSmsCode()
  if (provider === 'tencent') {
    await sendTencentSms(phone, code)
  } else {
    console.log(`[sms/mock] phone=${phone} code=${code}`)
  }
  upsertAuthCode(db, 'sms', phone, code)
  return { code, mock: provider === 'mock' }
}

export function verifySmsCode(db: DatabaseSync, phone: string, code: string): boolean {
  return verifyAuthCode(db, 'sms', phone, code)
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
