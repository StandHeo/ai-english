import nodemailer from 'nodemailer'
import { randomSmsCode } from './cryptoUtil.js'

export function emailProvider(): 'mock' | 'smtp' {
  return process.env.EMAIL_PROVIDER === 'smtp' ? 'smtp' : 'mock'
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

export function issueEmailCodeValue(): { code: string; mock: boolean } {
  const provider = emailProvider()
  const code = provider === 'mock' ? mockEmailCode() : randomSmsCode()
  return { code, mock: provider === 'mock' }
}

export async function sendAuthEmail(to: string, code: string): Promise<void> {
  if (emailProvider() === 'mock') {
    console.log(`[email/mock] email=${to} code=${code}`)
    return
  }
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
