/** 生产会员 API 根（无尾斜杠）。路径拼接为 `{base}/api/...`。 */
export const PRODUCTION_API_BASE = 'https://tudoudou-ai.site'

export const API_BASE_STORAGE_KEY = 'ai-english-api-base-v2'
export const LEGACY_API_BASE_STORAGE_KEY = 'ai-english-api-base-v1'

export function normalizeApiBase(url: string): string {
  return String(url || '').trim().replace(/\/$/, '')
}

function hostnameOf(url: string): string | null {
  const raw = normalizeApiBase(url)
  if (!raw) return null
  try {
    return new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`).hostname
  } catch {
    return null
  }
}

/** 本机 / RFC1918 调试地址，不能当作 Native 打包默认基址。 */
export function isPrivateLanApiBase(url: string): boolean {
  const host = hostnameOf(url)
  if (!host) return false
  const h = host.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

/**
 * 解析 API 根地址。
 * - 设置里保存的地址优先（含局域网调试覆盖）
 * - Native：忽略构建时打进去的局域网 ENV，默认生产域名
 * - 浏览器：ENV 为空则返回空字符串，走 Vite 同源代理
 */
export function resolveApiBase(opts: { stored: string; env: string; native: boolean }): string {
  const stored = normalizeApiBase(opts.stored)
  if (stored) return stored
  const env = normalizeApiBase(opts.env)
  if (opts.native) {
    if (env && !isPrivateLanApiBase(env)) return env
    return PRODUCTION_API_BASE
  }
  return env
}
