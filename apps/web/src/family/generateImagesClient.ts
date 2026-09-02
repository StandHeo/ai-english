import { cloudJson, downloadBinary, isCloudTimeoutMessage } from '../api/cloudHttp'
import { runAgnesCall } from './agnesRateLimit'
import { compressBytes, compressDataUrl, mockSlotDataUrl } from './compressImage'
import {
  buildKidsPrompt,
  clampImageSlots,
  type ImageSlot,
} from './imageSlots'
import {
  AGNES_IMAGE_MODEL,
  AGNES_IMAGE_SIZE,
  AGNES_IMAGE_URL,
  TONGYI_IMAGE_MODEL,
  TONGYI_IMAGE_URL,
  type FamilyImageCloudProvider,
} from './providers'

export {
  buildKidsPrompt,
  clampImageSlots,
  slotsFromLevel,
  type ImageSlot,
} from './imageSlots'

export type DirectImagesResult = {
  images: string[]
  warnings: string[]
  provider: FamilyImageCloudProvider
}

const NEGATIVE =
  '文字,水印,暴力,恐怖,血腥,写实血腥,成人内容,畸形,低清晰度,复杂背景杂乱'

function extractImageUrls(payload: unknown): string[] {
  const urls: string[] = []
  const walk = (node: unknown) => {
    if (!node) return
    if (typeof node === 'string') {
      if (/^https?:\/\//i.test(node) || node.startsWith('data:image')) urls.push(node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node === 'object') {
      const o = node as Record<string, unknown>
      if (typeof o.b64_json === 'string' && o.b64_json) {
        urls.push(`data:image/png;base64,${o.b64_json}`)
      }
      if (typeof o.image === 'string') urls.push(o.image)
      if (typeof o.url === 'string' && /^https?:\/\//i.test(o.url)) {
        urls.push(o.url)
      } else if (typeof o.url === 'string' && /\.(png|jpe?g|webp)(\?|$)/i.test(o.url)) {
        urls.push(o.url)
      }
      Object.values(o).forEach(walk)
    }
  }
  walk(payload)
  return [...new Set(urls)]
}

async function toJpegDataUrl(raw: string): Promise<string> {
  if (raw.startsWith('data:image')) return compressDataUrl(raw)
  const bytes = await downloadBinary(raw)
  return compressBytes(bytes)
}

const IMAGE_TIMEOUT_MS = 180_000

async function onceAgnesImage(apiKey: string, prompt: string): Promise<string> {
  const res = await runAgnesCall(async () => {
    const r = await cloudJson(AGNES_IMAGE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        model: AGNES_IMAGE_MODEL,
        prompt,
        n: 1,
        size: AGNES_IMAGE_SIZE,
      },
      timeoutMs: IMAGE_TIMEOUT_MS,
    })
    if (!r.ok && (r.status === 429 || /429|rate.?limit/i.test(String(r.error || '')))) {
      throw new Error(`agnes_image_http_429:${(r.error || '').slice(0, 160)}`)
    }
    return r
  })
  if (!res.ok) {
    if (res.error === 'llm_timeout' || isCloudTimeoutMessage(String(res.error || ''))) {
      throw new Error('llm_timeout')
    }
    throw new Error(`agnes_image_http_${res.status}:${(res.error || '').slice(0, 160)}`)
  }
  const urls = extractImageUrls(res.data)
  if (!urls.length) throw new Error('agnes_no_image_in_response')
  return toJpegDataUrl(urls[0])
}

async function callAgnesImage(apiKey: string, prompt: string): Promise<string> {
  try {
    return await onceAgnesImage(apiKey, prompt)
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first)
    if (msg === 'llm_timeout' || isCloudTimeoutMessage(msg)) {
      return await onceAgnesImage(apiKey, prompt)
    }
    throw first instanceof Error ? first : new Error(msg)
  }
}

async function onceTongyiImage(apiKey: string, prompt: string): Promise<string> {
  const res = await cloudJson(TONGYI_IMAGE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      model: TONGYI_IMAGE_MODEL,
      input: {
        messages: [{ role: 'user', content: [{ text: prompt }] }],
      },
      parameters: {
        prompt_extend: false,
        watermark: false,
        n: 1,
        negative_prompt: NEGATIVE,
        size: '1280*1280',
      },
    },
    timeoutMs: IMAGE_TIMEOUT_MS,
  })
  if (!res.ok) {
    if (res.error === 'llm_timeout' || isCloudTimeoutMessage(String(res.error || ''))) {
      throw new Error('llm_timeout')
    }
    throw new Error(`tongyi_http_${res.status}:${(res.error || '').slice(0, 160)}`)
  }
  const urls = extractImageUrls(res.data)
  if (!urls.length) throw new Error('tongyi_no_image_in_response')
  return toJpegDataUrl(urls[0])
}

async function callTongyiImage(apiKey: string, prompt: string): Promise<string> {
  try {
    return await onceTongyiImage(apiKey, prompt)
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first)
    if (msg === 'llm_timeout' || isCloudTimeoutMessage(msg)) {
      return await onceTongyiImage(apiKey, prompt)
    }
    throw first instanceof Error ? first : new Error(msg)
  }
}

/** 有限并发跑异步任务，结果顺序与 items 一致 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const limit = Math.max(1, Math.min(concurrency, items.length || 1))
  async function worker() {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}

/** 全部配图时同时跑几关（每天最多约 5 关；每关内场景+道具也会并行） */
export const FAMILY_IMAGE_LEVEL_CONCURRENCY = 5

export async function generateFamilyImagesDirect(input: {
  slots: ImageSlot[]
  apiKey: string
  provider: FamilyImageCloudProvider
  maxSlots?: number
}): Promise<DirectImagesResult> {
  const key = input.apiKey.trim()
  if (!key) throw new Error('image_provider_unavailable')
  const maxSlots = clampImageSlots(input.maxSlots)
  const slots = input.slots.slice(0, maxSlots)
  const warnings: string[] = []
  // 同关场景 / 道具并行请求，缩短单关耗时
  const images = await Promise.all(
    slots.map(async (slot) => {
      const prompt = buildKidsPrompt(slot)
      try {
        return input.provider === 'agnes'
          ? await callAgnesImage(key, prompt)
          : await callTongyiImage(key, prompt)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`slot_failed:${slot.subject}:${msg}`)
        return mockSlotDataUrl(slot.subject)
      }
    }),
  )
  return { images, warnings, provider: input.provider }
}
