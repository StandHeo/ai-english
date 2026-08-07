import { Capacitor } from '@capacitor/core'

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
 * API 根地址。浏览器开发时为空走 Vite 同源代理；
 * Capacitor App 必须填电脑 LAN，例如 http://192.168.2.104:8787
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
