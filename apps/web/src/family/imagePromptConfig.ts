import { apiJson, getApiBase, isNativeApp } from '../api/base'
import { parseImagePromptConfig, type ImagePromptConfig } from './imagePromptDefaults'
import {
  getActiveImagePromptConfig,
  resetActiveImagePromptConfig,
  setActiveImagePromptConfig,
} from './imageSlots'

const STORAGE_KEY = 'family-image-prompt-config-v1'
const CONFIG_PATH = '/api/family/image-prompt-config'
const FETCH_TIMEOUT_MS = 12_000

export type ImagePromptConfigFetch = { ok: boolean; data: unknown }

function readStored(): ImagePromptConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseImagePromptConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeStored(config: ImagePromptConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    /* quota / private mode */
  }
}

export function hydrateImagePromptConfigFromStorage(): void {
  const cached = readStored()
  if (cached) setActiveImagePromptConfig(cached)
}

hydrateImagePromptConfigFromStorage()

/** 浏览器 dev 没有 API base 时走同源 /api（Vite 代理）；App 用已配置的生产或覆盖地址。 */
export async function fetchImagePromptConfigFromApi(): Promise<ImagePromptConfigFetch> {
  const base = getApiBase()
  if (!base && !isNativeApp()) {
    try {
      const res = await fetch(CONFIG_PATH, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      const data: unknown = await res.json().catch(() => null)
      return { ok: res.ok, data }
    } catch {
      return { ok: false, data: null }
    }
  }
  const res = await apiJson(CONFIG_PATH, { timeoutMs: FETCH_TIMEOUT_MS })
  return { ok: res.ok, data: res.data }
}

let pending: Promise<ImagePromptConfig> | null = null

async function loadImagePromptConfig(fetchConfig: () => Promise<ImagePromptConfigFetch>): Promise<ImagePromptConfig> {
  try {
    const res = await fetchConfig()
    if (!res.ok) throw new Error('image_prompt_config_fetch_failed')
    const parsed = parseImagePromptConfig(res.data)
    if (!parsed) throw new Error('image_prompt_config_invalid')
    setActiveImagePromptConfig(parsed)
    writeStored(parsed)
    return getActiveImagePromptConfig()
  } catch {
    // 拉取失败：有上次成功缓存就用缓存，否则内置默认。
    const cached = readStored()
    if (cached) {
      setActiveImagePromptConfig(cached)
      return getActiveImagePromptConfig()
    }
    resetActiveImagePromptConfig()
    return getActiveImagePromptConfig()
  }
}

export function refreshImagePromptConfig(
  fetchConfig: () => Promise<ImagePromptConfigFetch> = fetchImagePromptConfigFromApi,
): Promise<ImagePromptConfig> {
  if (fetchConfig === fetchImagePromptConfigFromApi && pending) return pending
  const run = loadImagePromptConfig(fetchConfig)
  if (fetchConfig !== fetchImagePromptConfigFromApi) return run
  pending = run.finally(() => {
    pending = null
  })
  return pending
}

export function resetImagePromptConfigForTests(): void {
  pending = null
  resetActiveImagePromptConfig()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
