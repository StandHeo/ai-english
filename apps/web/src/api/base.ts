import { Capacitor, CapacitorHttp } from '@capacitor/core'

const KEY = 'ai-english-api-base-v1'
const SKIP_PRIVATE_KEY = 'ai-english-api-skip-private-v1'
const viteEnv = (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string; PROD?: boolean } }).env || {}
const ENV_BASE = String(viteEnv.VITE_API_BASE || '')
  .trim()
  .replace(/\/$/, '')

/**
 * 正式 App / 生产 Web 的会员与 /api 地址。
 * 临时：域名被未备案 SNI 拦截，先走成都轻量公网 IP 的 HTTP。备案或迁出大陆后改回 https://tudoudou-ai.site。
 * App / 生产包固定此地址，设置页不再提供修改入口。
 */
export const PRODUCTION_API_BASE = 'http://118.24.164.40'

/** 本会话内跳过已失败的局域网地址（localStorage 之外再挡一层）。 */
let sessionSkipPrivate = false

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, '')
}

export function hostnameOfApiBase(url: string): string {
  const raw = url.trim()
  if (!raw) return ''
  try {
    return new URL(raw.includes('://') ? raw : `http://${raw}`).hostname
  } catch {
    return ''
  }
}

/** 192.168/10./127. 以及 RFC1918 的 172.16–31、localhost。 */
export function isPrivateLanHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (!h) return false
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!ipv4) return false
  const a = Number(ipv4[1])
  const b = Number(ipv4[2])
  if (a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

export function isPrivateApiBase(url: string): boolean {
  return isPrivateLanHost(hostnameOfApiBase(url))
}

export function isApiUnreachableError(msg: string): boolean {
  return /Failed to connect|ConnectException|java\.net\.|OkHttp|ECONNREFUSED|ENETUNREACH|ENOTFOUND|ERR_CONNECTION|Failed to fetch|Network request failed|net::ERR_|UnknownHost|SocketException|llm_timeout|timeout|timed\s*out|aborted|AbortError|SocketTimeout|Socket closed|ETIMEDOUT/i.test(
    msg,
  )
}

export function resolveApiBase(opts: {
  stored: string
  envBase: string
  native: boolean
  prod: boolean
  skipPrivate?: boolean
}): string {
  // App / 生产固定官方服务器；本机 `npm run dev` 仍可走 Vite 代理或 VITE_API_BASE
  if (opts.native || opts.prod) return PRODUCTION_API_BASE
  const envBase = normalizeBase(opts.envBase)
  if (envBase) return envBase
  void opts.stored
  void opts.skipPrivate
  return ''
}

function skipPrivateActive(): boolean {
  if (sessionSkipPrivate) return true
  try {
    return localStorage.getItem(SKIP_PRIVATE_KEY) === '1'
  } catch {
    return false
  }
}

/** 已废弃：设置页不再允许覆盖；保留函数以免旧调用报错，写入会被忽略。 */
export function getStoredApiBase(): string {
  return ''
}

/** 已废弃：不再持久化自定义 API 地址。 */
export function setStoredApiBase(_url: string): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/**
 * 局域网地址连不上时改走官方站。只清私网覆盖，不清开发者有意填的公网调试地址。
 * 之后 getApiBase() 会跳过已失败的 192.168/10./127. 覆盖与烘焙的 VITE_API_BASE。
 */
export function recoverFromUnreachablePrivateBase(): boolean {
  if (!isPrivateApiBase(getApiBase())) return false
  sessionSkipPrivate = true
  try {
    if (isPrivateApiBase(getStoredApiBase())) localStorage.removeItem(KEY)
    localStorage.setItem(SKIP_PRIVATE_KEY, '1')
  } catch {
    /* session flag still applies */
  }
  return true
}

/** 家长一键切到官方服务器（会清掉已保存的 API 覆盖）。 */
export function switchToOfficialApiBase(): string {
  sessionSkipPrivate = true
  try {
    localStorage.removeItem(KEY)
    localStorage.setItem(SKIP_PRIVATE_KEY, '1')
  } catch {
    /* ignore */
  }
  return PRODUCTION_API_BASE
}

export function isOfficialApiBase(url = getApiBase()): boolean {
  return normalizeBase(url) === PRODUCTION_API_BASE
}

/**
 * API 根地址。
 * - 电脑浏览器 `npm run dev`：空字符串，走 Vite 同源代理 /api → localhost:8787
 * - Capacitor / 生产构建：固定 PRODUCTION_API_BASE
 */
export function getApiBase(): string {
  return resolveApiBase({
    stored: '',
    envBase: ENV_BASE,
    native: isNativeApp(),
    prod: Boolean(viteEnv.PROD),
    skipPrivate: skipPrivateActive(),
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
