import type { DatabaseSync } from 'node:sqlite'
import { assertCanSendAuthCode, upsertAuthCode, verifyAuthCode } from './authCodes.js'
import { randomSmsCode } from './cryptoUtil.js'
import { callTencentCloud } from './tencentCloud.js'

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

export async function sendTencentSms(phone: string, code: string): Promise<void> {
  if (!tencentSmsConfigured()) {
    throw new Error('sms_tencent_not_configured')
  }
  const result = await callTencentCloud({
    secretId: process.env.TENCENT_SMS_SECRET_ID!.trim(),
    secretKey: process.env.TENCENT_SMS_SECRET_KEY!.trim(),
    host: 'sms.tencentcloudapi.com',
    service: 'sms',
    action: 'SendSms',
    version: '2021-01-11',
    region: (process.env.TENCENT_SMS_REGION || 'ap-guangzhou').trim(),
    payload: {
      PhoneNumberSet: [`+86${phone}`],
      SmsSdkAppId: process.env.TENCENT_SMS_SDK_APP_ID!.trim(),
      SignName: process.env.TENCENT_SMS_SIGN_NAME!.trim(),
      TemplateId: process.env.TENCENT_SMS_TEMPLATE_ID!.trim(),
      TemplateParamSet: [code],
    },
  })
  if (result.errorCode) {
    throw new Error(`sms_tencent_failed:${result.errorCode}`)
  }
}
