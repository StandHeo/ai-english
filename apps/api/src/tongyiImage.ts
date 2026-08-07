/**
 * 通义万相（DashScope）文生图：家庭关卡配图。
 * 支持环境变量 Key；无 Key 或 FAMILY_IMAGE_PROVIDER=mock 时走占位。
 */

export type ImageSlot = {
  /** 用于 prompt 的主体描述（英文词或中文场景） */
  subject: string
  /** 可选角色标签 */
  role?: 'scene' | 'item'
}

export type GenerateFamilyImagesInput = {
  date: string
  slots: ImageSlot[]
  /** 家长可选传入；优先于环境变量 */
  apiKey?: string
  /** 强制走 mock（测试） */
  forceMock?: boolean
}

export type GenerateFamilyImagesResult = {
  images: string[]
  warnings: string[]
  provider: 'tongyi' | 'mock'
}

const SAFETY_PREFIX =
  '儿童绘本插画，温暖明亮，简单卡通，适合4到6岁儿童，无文字水印，无暴力恐怖血腥，正方形构图，'

const NEGATIVE =
  '文字,水印,暴力,恐怖,血腥,写实血腥,成人内容,畸形,低清晰度,复杂背景杂乱'

function envKey(): string {
  return (
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.TONGYI_API_KEY?.trim() ||
    ''
  )
}

function imageModel(): string {
  return process.env.TONGYI_IMAGE_MODEL?.trim() || 'wan2.6-t2i'
}

export function imageMax(): number {
  const n = Number(process.env.TONGYI_IMAGE_MAX || 4)
  if (!Number.isFinite(n) || n < 1) return 4
  return Math.min(8, Math.floor(n))
}

function providerMode(): 'tongyi' | 'mock' {
  const p = (process.env.FAMILY_IMAGE_PROVIDER || '').trim().toLowerCase()
  if (p === 'mock') return 'mock'
  return 'tongyi'
}

export function buildKidsPrompt(slot: ImageSlot): string {
  const roleHint =
    slot.role === 'scene'
      ? '作为游戏主场景背景，'
      : '作为儿童英语游戏中的单个道具或对象，居中，'
  return `${SAFETY_PREFIX}${roleHint}主题：${slot.subject.trim()}`
}

function mockDataUrl(label: string): string {
  const safe = label.replace(/[<>&"']/g, '').slice(0, 24) || 'fun'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="100%" height="100%" fill="#ffe8c8"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
    font-family="sans-serif" font-size="42" fill="#5a3d1b">${safe}</text>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

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
      if (typeof o.image === 'string') urls.push(o.image)
      if (typeof o.url === 'string' && /\.(png|jpe?g|webp)(\?|$)/i.test(o.url)) urls.push(o.url)
      if (typeof o.url === 'string' && /^https?:\/\//i.test(o.url) && !urls.includes(o.url)) {
        // dashscope CDN urls often have no extension
        if (/aliyuncs\.com|alicdn\.com|dashscope/i.test(o.url)) urls.push(o.url)
      }
      Object.values(o).forEach(walk)
    }
  }
  walk(payload)
  return [...new Set(urls)]
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:image')) return url
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`image_download_failed_${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  // 限制体积，避免撑爆 localStorage（约 1.5MB raw）
  if (buf.length > 1_500_000) {
    throw new Error('image_too_large')
  }
  const ct = res.headers.get('content-type') || 'image/png'
  const mime = ct.split(';')[0].trim() || 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

async function callTongyiOnce(apiKey: string, prompt: string): Promise<string> {
  const endpoint =
    process.env.TONGYI_IMAGE_ENDPOINT?.trim() ||
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

  const body = {
    model: imageModel(),
    input: {
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
    },
    parameters: {
      prompt_extend: true,
      watermark: false,
      n: 1,
      negative_prompt: NEGATIVE,
      size: '1280*1280',
    },
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`tongyi_bad_json_${res.status}`)
  }

  if (!res.ok) {
    const msg =
      typeof json === 'object' && json && 'message' in json
        ? String((json as { message?: string }).message)
        : text.slice(0, 200)
    throw new Error(`tongyi_http_${res.status}:${msg}`)
  }

  const urls = extractImageUrls(json)
  if (!urls.length) throw new Error('tongyi_no_image_in_response')
  return urlToDataUrl(urls[0])
}

/**
 * 从关卡快照推断配图槽位（最多 imageMax）。
 */
export function slotsFromLevel(level: Record<string, unknown>): ImageSlot[] {
  const max = imageMax()
  const slots: ImageSlot[] = []
  const setting =
    level.scene && typeof level.scene === 'object'
      ? String((level.scene as { setting?: string }).setting || '')
      : ''
  const words = Array.isArray(level.target_words)
    ? level.target_words.map(String).filter(Boolean)
    : []

  if (setting || words[0]) {
    slots.push({
      subject: setting || `儿童英语游戏场景，关于 ${words[0]}`,
      role: 'scene',
    })
  }

  for (const w of words) {
    if (slots.length >= max) break
    if (slots.some((s) => s.subject === w)) continue
    slots.push({ subject: w, role: 'item' })
  }

  // 从 find/ask 选项补槽
  const beats = Array.isArray(level.beats) ? level.beats : []
  for (const raw of beats) {
    if (slots.length >= max) break
    const b = raw as Record<string, unknown>
    const opts =
      (Array.isArray(b.options) && b.options) ||
      (b.fallback &&
        typeof b.fallback === 'object' &&
        Array.isArray((b.fallback as { options?: unknown }).options) &&
        (b.fallback as { options: unknown[] }).options) ||
      []
    for (const o of opts) {
      if (slots.length >= max) break
      const id = String((o as { id?: string })?.id || '').trim()
      if (!id) continue
      if (slots.some((s) => s.subject.toLowerCase() === id.toLowerCase())) continue
      slots.push({ subject: id, role: 'item' })
    }
  }

  return slots.slice(0, max)
}

export async function generateFamilyImages(
  input: GenerateFamilyImagesInput,
): Promise<GenerateFamilyImagesResult> {
  const warnings: string[] = []
  const slots = input.slots.slice(0, imageMax())
  if (!slots.length) {
    return { images: [], warnings: ['no_slots'], provider: 'mock' }
  }

  const wantMock = Boolean(input.forceMock) || providerMode() === 'mock'
  if (wantMock) {
    return {
      images: slots.map((s) => mockDataUrl(s.subject)),
      warnings: ['using_mock_images'],
      provider: 'mock',
    }
  }

  const key = input.apiKey?.trim() || envKey()
  if (!key) {
    throw new Error('image_provider_unavailable')
  }

  const images: string[] = []
  for (const slot of slots) {
    try {
      const prompt = buildKidsPrompt(slot)
      const dataUrl = await callTongyiOnce(key, prompt)
      images.push(dataUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`slot_failed:${slot.subject}:${msg}`)
      images.push(mockDataUrl(slot.subject))
    }
  }

  return { images, warnings, provider: 'tongyi' }
}
