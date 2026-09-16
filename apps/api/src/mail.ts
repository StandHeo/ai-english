import nodemailer from 'nodemailer'
import { randomSmsCode } from './cryptoUtil.js'
import { callTencentCloud } from './tencentCloud.js'

export type EmailProvider = 'mock' | 'smtp' | 'tencent_ses'

export function emailProvider(): EmailProvider {
  const raw = (process.env.EMAIL_PROVIDER || 'mock').trim().toLowerCase().replace(/-/g, '_')
  if (raw === 'smtp') return 'smtp'
  if (raw === 'tencent_ses' || raw === 'ses' || raw === 'tencent') return 'tencent_ses'
  return 'mock'
}

export function mockEmailCode(): string {
  const raw = (process.env.MOCK_EMAIL_CODE || process.env.MOCK_SMS_CODE || '123456').trim()
  return /^\d{4,8}$/.test(raw) ? raw : '123456'
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim())
}

function smtpSecure(): boolean {
  const raw = (process.env.SMTP_SECURE || '').trim().toLowerCase()
  if (raw === 'on' || raw === 'true' || raw === '1') return true
  if (raw === 'off' || raw === 'false' || raw === '0') return false
  return Number(process.env.SMTP_PORT || 587) === 465
}

function envTrim(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

function sesSecretId(): string {
  return envTrim('TENCENT_SES_SECRET_ID', 'TENCENT_CLOUD_SECRET_ID')
}

function sesSecretKey(): string {
  return envTrim('TENCENT_SES_SECRET_KEY', 'TENCENT_CLOUD_SECRET_KEY')
}

function sesFrom(): string {
  return envTrim('TENCENT_SES_FROM', 'EMAIL_FROM', 'SMTP_FROM')
}

function sesTemplateId(): number | null {
  const raw = (process.env.TENCENT_SES_TEMPLATE_ID || '').trim()
  if (!/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return id > 0 ? id : null
}

function sesRegion(): string {
  return envTrim('TENCENT_SES_REGION') || 'ap-guangzhou'
}

export function tencentSesConfigured(): boolean {
  return Boolean(sesSecretId() && sesSecretKey() && sesFrom() && sesTemplateId())
}

export function emailSendPrecheckError(): string | null {
  const provider = emailProvider()
  if (provider === 'smtp' && !smtpConfigured()) return 'email_smtp_not_configured'
  if (provider === 'tencent_ses' && !tencentSesConfigured()) return 'email_ses_not_configured'
  return null
}

export function isEmailProviderFailure(message: string): boolean {
  return (
    message === 'email_smtp_not_configured' ||
    message.startsWith('email_smtp_failed:') ||
    message === 'email_ses_not_configured' ||
    message.startsWith('email_ses_failed:')
  )
}

export function issueEmailCodeValue(): { code: string; mock: boolean } {
  const provider = emailProvider()
  const code = provider === 'mock' ? mockEmailCode() : randomSmsCode()
  return { code, mock: provider === 'mock' }
}

async function sendSmtp(to: string, code: string): Promise<void> {
  if (!smtpConfigured()) {
    throw new Error('email_smtp_not_configured')
  }
  const host = process.env.SMTP_HOST!.trim()
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  const from = process.env.SMTP_FROM!.trim()
  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure: smtpSecure(),
    auth: user ? { user, pass: pass || '' } : undefined,
  })
  try {
    await transporter.sendMail({
      from,
      to,
      subject: '土豆豆AI英语 登录验证码',
      text: `您的验证码是 ${code}，5 分钟内有效。如非本人操作请忽略本邮件。`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send_failed'
    throw new Error(`email_smtp_failed:${message}`)
  }
}

export async function sendTencentSes(to: string, code: string): Promise<void> {
  if (!tencentSesConfigured()) {
    throw new Error('email_ses_not_configured')
  }
  const templateId = sesTemplateId()!
  const subject = envTrim('TENCENT_SES_SUBJECT') || '土豆豆AI英语 登录验证码'
  const result = await callTencentCloud({
    secretId: sesSecretId(),
    secretKey: sesSecretKey(),
    host: 'ses.tencentcloudapi.com',
    service: 'ses',
    action: 'SendEmail',
    version: '2020-10-02',
    region: sesRegion(),
    payload: {
      FromEmailAddress: sesFrom(),
      Destination: [to],
      Subject: subject,
      Template: {
        TemplateID: templateId,
        TemplateData: JSON.stringify({ code }),
      },
    },
  })
  if (result.errorCode) {
    throw new Error(`email_ses_failed:${result.errorCode}`)
  }
}

export async function sendAuthEmail(to: string, code: string): Promise<void> {
  const provider = emailProvider()
  if (provider === 'mock') {
    console.log(`[email/mock] email=${to} code=${code}`)
    return
  }
  if (provider === 'tencent_ses') {
    await sendTencentSes(to, code)
    return
  }
  await sendSmtp(to, code)
}
