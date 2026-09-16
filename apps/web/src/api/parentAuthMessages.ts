export const SEND_CODE_COOLDOWN_SEC = 60

export const PARENT_SEND_SUCCESS = '验证码已发送到邮箱，也请看看垃圾箱'

export function isParentNetworkError(error: string | undefined): boolean {
  if (!error) return false
  if (error === 'network_unreachable' || error === 'network_timeout' || error === 'network_error') {
    return true
  }
  if (error === 'missing_api_base') return true
  if (/^http_(0|502|503|504)$/.test(error)) return true
  return /Failed to connect|ConnectException|ECONNREFUSED|ENOTFOUND|UnknownHost|Failed to fetch|NetworkError|ERR_|Cleartext|connection refused|SocketException|llm_timeout|timed\s*out|timeout/i.test(
    error,
  )
}

export function parentNetworkHint(error?: string): string {
  if (error === 'network_timeout' || /timeout|timed\s*out|llm_timeout/i.test(error || '')) {
    return '连接超时，请稍后重试'
  }
  return '连不上会员服务，请检查网络后重试'
}

export function parentSendErrorMessage(error?: string): string {
  switch (error) {
    case 'email_rate_limited':
      return '发送太频繁，请稍后再试'
    case 'auth_ip_rate_limited':
    case 'sms_ip_rate_limited':
      return '该网络发送过于频繁，请稍后再试'
    case 'invalid_email':
      return '请填写有效邮箱'
    case 'email_ses_not_configured':
    case 'email_smtp_not_configured':
      return '邮件服务暂不可用，请稍后重试'
    case 'captcha_required':
      return '请先完成图形验证'
    case 'captcha_invalid':
      return '图形验证码错误，请重试'
    default:
      if (error?.startsWith('email_ses_failed:') || error?.startsWith('email_smtp_failed:')) {
        return '验证码邮件发送失败，请稍后重试'
      }
      if (isParentNetworkError(error)) return parentNetworkHint(error)
      return '发送失败，请稍后重试'
  }
}

export function parentLoginErrorMessage(error?: string): string {
  if (error === 'invalid_code') return '验证码错误或已过期'
  if (isParentNetworkError(error)) return parentNetworkHint(error)
  return '登录失败，请稍后重试'
}

export function classifyMembershipNetworkError(msg: string): string {
  if (/timeout|timed\s*out|aborted|AbortError|SocketTimeout|ETIMEDOUT|llm_timeout/i.test(msg)) {
    return 'network_timeout'
  }
  if (
    /Failed to connect|ConnectException|ECONNREFUSED|ENOTFOUND|UnknownHost|Failed to fetch|NetworkError|ERR_|Cleartext|connection refused|SocketException/i.test(
      msg,
    )
  ) {
    return 'network_unreachable'
  }
  return 'network_error'
}
