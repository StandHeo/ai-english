import { apiUrl } from './base'

const TOKEN_KEY = 'ai-english-parent-token-v1'

export type MeResponse = {
  plus: boolean
  expiresAt: string | null
  email?: string | null
  phone?: string | null
}

export type BillingPlans = {
  provider: 'manual' | 'wechat'
  plusExcludesModelFees: boolean
  plans: { id: 'month' | 'year'; priceFen: number; days: number }[]
}

export function getParentToken(): string {
  try {
    return (localStorage.getItem(TOKEN_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function setParentToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearParentToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function membershipFetch(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; error?: string }> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = init.token === undefined ? getParentToken() : init.token
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(apiUrl(path), {
      method: init.method || (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : String(data.error || `http_${res.status}`),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 0, data: {}, error: msg }
  }
}

export async function fetchAuthConfig(): Promise<{ captcha: boolean; authChannel: 'email' | 'sms' }> {
  const res = await membershipFetch('/api/auth/config')
  const channel = res.data.authChannel === 'sms' ? 'sms' : 'email'
  return { captcha: Boolean(res.ok && res.data.captcha), authChannel: channel }
}

/** @deprecated alias of fetchAuthConfig */
export async function fetchSmsAuthConfig(): Promise<{ captcha: boolean }> {
  const cfg = await fetchAuthConfig()
  return { captcha: cfg.captcha }
}

export async function fetchSmsCaptcha(): Promise<{ id: string; image: string } | null> {
  const res = await membershipFetch('/api/auth/captcha')
  const id = typeof res.data.id === 'string' ? res.data.id : ''
  const image = typeof res.data.image === 'string' ? res.data.image : ''
  if (!res.ok || !id || !image) return null
  return { id, image }
}

function captchaBody(captcha?: { captchaId?: string; captchaAnswer?: string }) {
  return {
    ...(captcha?.captchaId ? { captchaId: captcha.captchaId } : {}),
    ...(captcha?.captchaAnswer ? { captchaAnswer: captcha.captchaAnswer } : {}),
  }
}

export async function sendParentEmail(
  email: string,
  captcha?: { captchaId?: string; captchaAnswer?: string },
) {
  return membershipFetch('/api/auth/email/send', {
    body: { email, ...captchaBody(captcha) },
  })
}

export async function verifyParentEmail(email: string, code: string) {
  const res = await membershipFetch('/api/auth/email/verify', { body: { email, code }, token: null })
  const token = typeof res.data.token === 'string' ? res.data.token : ''
  if (res.ok && token) setParentToken(token)
  return res
}

export async function sendParentSms(
  phone: string,
  captcha?: { captchaId?: string; captchaAnswer?: string },
) {
  return membershipFetch('/api/auth/sms/send', {
    body: { phone, ...captchaBody(captcha) },
  })
}

export async function verifyParentSms(phone: string, code: string) {
  const res = await membershipFetch('/api/auth/sms/verify', { body: { phone, code }, token: null })
  const token = typeof res.data.token === 'string' ? res.data.token : ''
  if (res.ok && token) setParentToken(token)
  return res
}

export async function fetchMe(): Promise<MeResponse | null> {
  const token = getParentToken()
  if (!token) return null
  const res = await membershipFetch('/api/me', { token })
  if (!res.ok) {
    if (res.status === 401) clearParentToken()
    return null
  }
  return {
    plus: Boolean(res.data.plus),
    expiresAt: typeof res.data.expiresAt === 'string' ? res.data.expiresAt : null,
    email: typeof res.data.email === 'string' ? res.data.email : res.data.email === null ? null : undefined,
    phone: typeof res.data.phone === 'string' ? res.data.phone : res.data.phone === null ? null : undefined,
  }
}

export async function logoutParent(): Promise<void> {
  const token = getParentToken()
  if (token) await membershipFetch('/api/auth/logout', { method: 'POST', token })
  clearParentToken()
}

export async function deleteParentAccount(): Promise<{ ok: boolean; error?: string }> {
  const res = await membershipFetch('/api/me/delete', { method: 'POST' })
  if (res.ok || res.status === 401) clearParentToken()
  return { ok: res.ok, error: res.error }
}

export async function fetchBillingPlans(): Promise<BillingPlans | null> {
  const res = await membershipFetch('/api/billing/plans')
  if (!res.ok) return null
  const plans = Array.isArray(res.data.plans)
    ? (res.data.plans as BillingPlans['plans'])
    : [
        { id: 'month' as const, priceFen: 1800, days: 30 },
        { id: 'year' as const, priceFen: 14800, days: 365 },
      ]
  return {
    provider: res.data.provider === 'wechat' ? 'wechat' : 'manual',
    plusExcludesModelFees: res.data.plusExcludesModelFees !== false,
    plans,
  }
}

export async function createBillingOrder(plan: 'month' | 'year') {
  return membershipFetch('/api/billing/orders', { body: { plan } })
}

export function formatFen(fen: number): string {
  return `¥${(fen / 100).toFixed(0)}`
}
