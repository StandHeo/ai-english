import { isApiUnreachableError } from './base'

const SEND_MAP: Record<string, string> = {
  cannot_reach_server: '连不上服务器，请检查网络后重试',
  missing_api_base: '连不上服务器，请检查网络后重试',
  llm_timeout: '连不上服务器，请检查网络后重试',
  email_rate_limited: '发送太频繁，请稍后再试',
  auth_ip_rate_limited: '发送太频繁，请稍后再试',
  sms_ip_rate_limited: '发送太频繁，请稍后再试',
  invalid_email: '请填写有效邮箱',
  email_ses_not_configured: '邮件暂时发不出去，请稍后重试',
  email_smtp_not_configured: '邮件暂时发不出去，请稍后重试',
  captcha_required: '请先填写图形验证码',
  captcha_invalid: '图形验证码错误，请重试',
}

export function isRawNetworkDump(error: string): boolean {
  return isApiUnreachableError(error) || /ConnectException|java\.net\.|OkHttp/i.test(error)
}

export function sanitizeMembershipError(error?: string): string | undefined {
  if (!error) return error
  if (isRawNetworkDump(error)) return 'cannot_reach_server'
  return error
}

export function parentSendErrorMessage(error?: string): string {
  if (error && SEND_MAP[error]) return SEND_MAP[error]
  if (error?.startsWith('email_ses_failed:') || error?.startsWith('email_smtp_failed:')) {
    return '邮件暂时发不出去，请稍后重试'
  }
  if (error && isRawNetworkDump(error)) return SEND_MAP.cannot_reach_server
  return '发送失败，请稍后重试'
}

export function parentVerifyErrorMessage(error?: string): string {
  if (error === 'invalid_code') return '验证码错误或已过期'
  if (error === 'cannot_reach_server' || (error && isRawNetworkDump(error))) {
    return '连不上服务器，请检查网络后重试'
  }
  return '登录失败，请稍后重试'
}
