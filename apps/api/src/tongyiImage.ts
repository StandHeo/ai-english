/**
 * 通义万相（DashScope）文生图：家庭关卡配图。
 * 支持环境变量 Key；无 Key 或 FAMILY_IMAGE_PROVIDER=mock 时走占位。
 */

import sharp from 'sharp'
import { runAgnesCall } from './agnesRateLimit'

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
  /** 配图张数上限（与设置里关键词数一致） */
  maxSlots?: number
  /** tongyi | agnes | mock；缺省用 FAMILY_IMAGE_PROVIDER */
  imageProvider?: string
}

export type GenerateFamilyImagesResult = {
  images: string[]
  warnings: string[]
  provider: 'tongyi' | 'agnes' | 'mock'
  debug?: {
    maxSlots: number
    calls: Array<{
      subject: string
      prompt: string
      ok: boolean
      detail?: string
    }>
  }
}

const SAFETY_PREFIX =
  '儿童绘本插画，温暖明亮，简单卡通，适合4到6岁儿童，无文字水印，无暴力恐怖血腥，正方形构图，'

const NEGATIVE =
  '文字,水印,暴力,恐怖,血腥,写实血腥,成人内容,畸形,低清晰度,复杂背景杂乱'

/** 压缩后 data URL 上限（约 400KB raw ≈ 550KB base64） */
const MAX_COMPRESSED_BYTES = 400_000
const TONGYI_TIMEOUT_MS = 120_000
const MAX_EDGE = 512
const JPEG_QUALITY = 80

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

function imageMax(): number {
  const n = Number(process.env.TONGYI_IMAGE_MAX || 12)
  if (!Number.isFinite(n) || n < 1) return 12
  return Math.min(12, Math.floor(n))
}

export function clampImageSlots(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 9
  return Math.min(12, Math.max(3, Math.floor(v)))
}

function slotSubjectKey(subject: string): string {
  return subject.trim().toLowerCase()
}

export function buildKidsPrompt(slot: ImageSlot): string {
  const subject = slot.subject.trim()
  if (slot.role === 'scene') {
    return `${SAFETY_PREFIX}作为游戏主场景的环境全景背景，开阔画面，展示地点与氛围，不要把单个巨大道具放在画面正中，主题：${subject}`
  }
  return `${SAFETY_PREFIX}作为儿童英语游戏中的单个道具或对象，居中，主题：${subject}`
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
      if (typeof o.b64_json === 'string' && o.b64_json) {
        urls.push(`data:image/png;base64,${o.b64_json}`)
      }
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

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return (
    err.name === 'TimeoutError' ||
    err.name === 'AbortError' ||
    /timeout|aborted/i.test(err.message)
  )
}

/**
 * 将原始图片 buffer 缩到最长边 512，输出 JPEG（控制 localStorage 体积）。
 */
export async function compressImageBuffer(buf: Buffer): Promise<Buffer> {
  let quality = JPEG_QUALITY
  let out = await sharp(buf)
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()

  // 仍过大则再降质量
  while (out.length > MAX_COMPRESSED_BYTES && quality > 40) {
    quality -= 15
    out = await sharp(buf)
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
  }
  return out
}

export async function bufferToJpegDataUrl(buf: Buffer): Promise<string> {
  const compressed = await compressImageBuffer(buf)
  if (compressed.length > MAX_COMPRESSED_BYTES) {
    throw new Error('image_too_large')
  }
  return `data:image/jpeg;base64,${compressed.toString('base64')}`
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:image')) {
    const m = /^data:image\/[^;]+;base64,(.+)$/i.exec(url)
    if (!m) return url
    const raw = Buffer.from(m[1], 'base64')
    return bufferToJpegDataUrl(raw)
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`image_download_failed_${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return bufferToJpegDataUrl(buf)
}

async function callTongyiOnce(
  apiKey: string,
  prompt: string,
): Promise<{ dataUrl: string; rawPreview: string }> {
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
      prompt_extend: false,
      watermark: false,
      n: 1,
      negative_prompt: NEGATIVE,
      size: '1280*1280',
    },
  }

  console.log('[tongyi] request', JSON.stringify({ endpoint, model: body.model, prompt }))

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TONGYI_TIMEOUT_MS),
  })

  const text = await res.text()
  console.log(
    '[tongyi] response',
    JSON.stringify({
      status: res.status,
      bodyPreview: text.slice(0, 800),
    }),
  )

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
  const dataUrl = await urlToDataUrl(urls[0])
  return {
    dataUrl,
    rawPreview: `url=${urls[0].slice(0, 120)} dataUrlLen=${dataUrl.length}`,
  }
}

/** 超时则同一 prompt 再试一次 */
async function callTongyiWithRetry(
  apiKey: string,
  prompt: string,
): Promise<{ dataUrl: string; rawPreview: string }> {
  try {
    return await callTongyiOnce(apiKey, prompt)
  } catch (err) {
    if (!isTimeoutError(err)) throw err
    console.log('[tongyi] retry after timeout', prompt.slice(0, 80))
    return await callTongyiOnce(apiKey, prompt)
  }
}

/**
 * 从关卡快照推断配图槽位（英文关键词优先，张数由 maxSlots 控制）。
 */
export function slotsFromLevel(
  level: Record<string, unknown>,
  maxSlots?: number,
): ImageSlot[] {
  const max = clampImageSlots(maxSlots ?? imageMax())
  const words = Array.isArray(level.target_words)
    ? level.target_words.map(String).filter((w) => w.trim())
    : []
  const setting =
    level.scene && typeof level.scene === 'object'
      ? String((level.scene as { setting?: unknown }).setting || '').trim()
      : ''
  const sceneSubject = setting || words[0]?.trim() || 'playground'
  const slots: ImageSlot[] = [{ subject: sceneSubject, role: 'scene' }]
  const seen = new Set<string>([slotSubjectKey(sceneSubject)])

  const pushItem = (raw: string) => {
    if (slots.length >= max) return
    const subject = raw.trim()
    if (!subject) return
    const key = slotSubjectKey(subject)
    if (seen.has(key)) return
    seen.add(key)
    slots.push({ subject, role: 'item' })
  }

  for (const w of words) pushItem(w)

  const beats = Array.isArray(level.beats) ? level.beats : []
  for (const raw of beats) {
    if (slots.length >= max) break
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Record<string, unknown>
    let opts: unknown[] = []
    if (Array.isArray(b.options)) opts = b.options
    else if (b.fallback && typeof b.fallback === 'object') {
      const fb = (b.fallback as { options?: unknown }).options
      if (Array.isArray(fb)) opts = fb
    }
    for (const o of opts) {
      if (slots.length >= max) break
      if (!o || typeof o !== 'object') continue
      pushItem(String((o as { id?: string }).id || ''))
    }
  }

  return slots.slice(0, max)
}

async function callAgnesOnce(
  apiKey: string,
  prompt: string,
): Promise<{ dataUrl: string; rawPreview: string }> {
  return runAgnesCall(async () => {
    const model = process.env.AGNES_IMAGE_MODEL?.trim() || 'agnes-image-2.1-flash'
    const endpoint =
      process.env.AGNES_IMAGE_ENDPOINT?.trim() ||
      'https://apihub.agnes-ai.com/v1/images/generations'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: process.env.AGNES_IMAGE_SIZE?.trim() || '1024x1024',
      }),
      signal: AbortSignal.timeout(TONGYI_TIMEOUT_MS),
    })
    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`agnes_bad_json_${res.status}`)
    }
    if (!res.ok) {
      throw new Error(`agnes_image_http_${res.status}:${text.slice(0, 160)}`)
    }
    const urls = extractImageUrls(json)
    if (!urls.length) throw new Error('agnes_no_image_in_response')
    const dataUrl = await urlToDataUrl(urls[0])
    return { dataUrl, rawPreview: `agnes url=${urls[0].slice(0, 80)}` }
  })
}

function resolveImageProvider(raw?: string): 'tongyi' | 'agnes' | 'mock' {
  const env = (process.env.FAMILY_IMAGE_PROVIDER || 'tongyi').trim().toLowerCase()
  const v = (raw || env).trim().toLowerCase()
  if (v === 'mock' || v === 'agnes' || v === 'tongyi') return v
  return env === 'mock' || env === 'agnes' ? env : 'tongyi'
}

export async function generateFamilyImages(
  input: GenerateFamilyImagesInput,
): Promise<GenerateFamilyImagesResult> {
  const warnings: string[] = []
  const maxSlots = clampImageSlots(input.maxSlots ?? imageMax())
  const slots = input.slots.slice(0, maxSlots)
  const debugCalls: NonNullable<GenerateFamilyImagesResult['debug']>['calls'] = []

  if (!slots.length) {
    return {
      images: [],
      warnings: ['no_slots'],
      provider: 'mock',
      debug: { maxSlots, calls: [] },
    }
  }

  const imageKind = resolveImageProvider(input.imageProvider)
  const wantMock = Boolean(input.forceMock) || imageKind === 'mock'
  if (wantMock) {
    for (const s of slots) {
      debugCalls.push({
        subject: s.subject,
        prompt: `(mock) ${s.subject}`,
        ok: true,
        detail: 'mock_svg_placeholder',
      })
    }
    return {
      images: slots.map((s) => mockDataUrl(s.subject)),
      warnings: ['using_mock_images'],
      provider: 'mock',
      debug: { maxSlots, calls: debugCalls },
    }
  }

  const key =
    input.apiKey?.trim() ||
    (imageKind === 'agnes'
      ? process.env.AGNES_API_KEY?.trim() || envKey()
      : envKey())
  if (!key) {
    throw new Error('image_provider_unavailable')
  }

  const images: string[] = []
  for (const slot of slots) {
    const prompt = buildKidsPrompt(slot)
    try {
      const { dataUrl, rawPreview } =
        imageKind === 'agnes'
          ? await callAgnesOnce(key, prompt)
          : await callTongyiWithRetry(key, prompt)
      images.push(dataUrl)
      debugCalls.push({ subject: slot.subject, prompt, ok: true, detail: rawPreview })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`slot_failed:${slot.subject}:${msg}`)
      images.push(mockDataUrl(slot.subject))
      debugCalls.push({ subject: slot.subject, prompt, ok: false, detail: msg })
    }
  }

  return {
    images,
    warnings,
    provider: imageKind === 'agnes' ? 'agnes' : 'tongyi',
    debug: { maxSlots, calls: debugCalls },
  }
}
