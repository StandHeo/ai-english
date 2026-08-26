import { Capacitor, CapacitorHttp } from '@capacitor/core'

const KEY = 'ai-english-api-base-v1'
const ENV_BASE = String(import.meta.env.VITE_API_BASE || '')
  .trim()
  .replace(/\/$/, '')

/** User override (App 设置里填写电脑局域网 API). */
export function getStoredApiBase(): string {
  try {
    return (localStorage.getItem(KEY) || '').trim().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function setStoredApiBase(url: string): void {
  localStorage.setItem(KEY, url.trim().replace(/\/$/, ''))
}

/**
 * API 根地址。浏览器开发时为空走 Vite 同源代理。
 * Capacitor App：家庭生成/配图有云 Key 时可直连厂商 HTTPS，不必填局域网；
 * 仅当走电脑 .env 代理（关卡 ASR 等）时才需要，例如 http://192.168.2.104:8787
 */
export function getApiBase(): string {
  return getStoredApiBase() || ENV_BASE
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
