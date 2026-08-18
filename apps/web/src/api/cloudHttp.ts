import { CapacitorHttp } from '@capacitor/core'
import { isNativeApp } from './base'

export type CloudJsonResult = {
  ok: boolean
  status: number
  data: Record<string, unknown>
  text: string
  error?: string
}

/**
 * JSON HTTPS 调用。App 走 CapacitorHttp（无 CORS）；浏览器走 fetch。
 */
export async function cloudJson(
  url: string,
  init: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
    timeoutMs?: number
  } = {},
): Promise<CloudJsonResult> {
  const method = (init.method || 'POST').toUpperCase()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...init.headers,
  }
  const timeoutMs = init.timeoutMs ?? 120_000

  try {
    if (isNativeApp()) {
      const res = await CapacitorHttp.request({
        url,
        method,
        headers,
        data: init.body,
        connectTimeout: 20_000,
        readTimeout: timeoutMs,
        responseType: 'json',
      })
      let data: Record<string, unknown> = {}
      let text = ''
      if (typeof res.data === 'string') {
        text = res.data
        try {
          data = JSON.parse(res.data) as Record<string, unknown>
        } catch {
          data = { raw: res.data }
        }
      } else if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        data = res.data as Record<string, unknown>
        text = JSON.stringify(res.data)
      } else if (res.data != null) {
        text = String(res.data)
        data = { raw: res.data }
      }
      const ok = res.status >= 200 && res.status < 300
      return {
        ok,
        status: res.status,
        data,
        text,
        error: ok ? undefined : String(data.error || data.message || `http_${res.status}`),
      }
    }

    const res = await fetch(url, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    let data: Record<string, unknown> = {}
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      data = { raw: text }
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      text,
      error: res.ok ? undefined : String(data.error || data.message || `http_${res.status}`),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const timeout = /timeout|aborted|AbortError/i.test(msg)
    return {
      ok: false,
      status: 0,
      data: {},
      text: '',
      error: timeout ? 'llm_timeout' : msg,
    }
  }
}

export async function downloadBinary(url: string, timeoutMs = 60_000): Promise<Uint8Array> {
  if (isNativeApp()) {
    const res = await CapacitorHttp.request({
      url,
      method: 'GET',
      connectTimeout: 20_000,
      readTimeout: timeoutMs,
      responseType: 'arraybuffer',
    })
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`image_download_failed_${res.status}`)
    }
    const data = res.data
    if (data instanceof ArrayBuffer) return new Uint8Array(data)
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    }
    if (typeof data === 'string' && data) {
      const bin = atob(data)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out
    }
    throw new Error('image_download_empty')
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`image_download_failed_${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}
