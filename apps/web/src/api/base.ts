import { Capacitor, CapacitorHttp } from '@capacitor/core'
import {
  API_BASE_STORAGE_KEY,
  LEGACY_API_BASE_STORAGE_KEY,
  normalizeApiBase,
  resolveApiBase,
} from './apiBase'

export { PRODUCTION_API_BASE, resolveApiBase } from './apiBase'

const ENV_BASE = normalizeApiBase(String(import.meta.env.VITE_API_BASE || ''))

function discardLegacyApiBase(): void {
  try {
    localStorage.removeItem(LEGACY_API_BASE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** User override（家庭日记设置里的电脑局域网 API）。旧 v1 存量不再读取。 */
export function getStoredApiBase(): string {
  try {
    discardLegacyApiBase()
    return normalizeApiBase(localStorage.getItem(API_BASE_STORAGE_KEY) || '')
  } catch {
    return ''
  }
}

export function setStoredApiBase(url: string): void {
  discardLegacyApiBase()
  const next = normalizeApiBase(url)
  if (!next) {
    localStorage.removeItem(API_BASE_STORAGE_KEY)
    return
  }
  localStorage.setItem(API_BASE_STORAGE_KEY, next)
}

/**
 * API 根地址。
 * 浏览器开发：空字符串，走 Vite 同源代理到本机 8787。
 * Native/Capacitor：默认 https://tudoudou-ai.site；设置里的局域网地址仍可覆盖。
 */
export function getApiBase(): string {
  return resolveApiBase({
    stored: getStoredApiBase(),
    env: ENV_BASE,
    native: isNativeApp(),
  })
}

export function apiUrl(path: string): string {
  const base = getApiBase()
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export function missingNativeApiBase(): boolean {
  return isNativeApp() && !getApiBase()
}

export type ApiJsonResult = {
  ok: boolean
  status: number
  data: Record<string, unknown>
  error?: string
}

/**
 * JSON API 请求。App 内走原生 CapacitorHttp，避开 WebView Mixed Content。
 */
export async function apiJson(
  path: string,
  init: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
    /** 读超时，默认 60s；通义配图建议 300s */
    timeoutMs?: number
  } = {},
): Promise<ApiJsonResult> {
  const url = apiUrl(path)
  if (!url || url === path) {
    return { ok: false, status: 0, data: {}, error: 'missing_api_base' }
  }

  const method = (init.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...init.headers,
  }
  const timeoutMs = init.timeoutMs ?? 60_000

  try {
    if (isNativeApp()) {
      const res = await CapacitorHttp.request({
        url,
        method,
        headers,
        data: init.body,
        connectTimeout: 60_000,
        readTimeout: timeoutMs,
        responseType: 'json',
      })
      let data: Record<string, unknown> = {}
      if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        data = res.data as Record<string, unknown>
      } else if (typeof res.data === 'string' && res.data.trim()) {
        try {
          data = JSON.parse(res.data) as Record<string, unknown>
        } catch {
          data = { raw: res.data }
        }
      }
      const ok = res.status >= 200 && res.status < 300
      return {
        ok,
        status: res.status,
        data,
        error: ok ? undefined : String(data.error || `http_${res.status}`),
      }
    }

    const res = await fetch(url, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
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
    const timeout =
      /timeout|timed\s*out|aborted|AbortError|SocketTimeout|Socket closed|SocketException|ETIMEDOUT/i.test(
        msg,
      )
    return { ok: false, status: 0, data: {}, error: timeout ? 'llm_timeout' : msg }
  }
}
