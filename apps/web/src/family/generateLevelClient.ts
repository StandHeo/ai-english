import { cloudJson, isCloudTimeoutMessage } from '../api/cloudHttp'
import { runAgnesCall } from './agnesRateLimit'
import { sceneNeedsTranslation } from './imageSlots'
import {
  FAMILY_PACK_SYSTEM_PROMPT,
  buildPackUserContent,
  clampPackLevelCount,
  parseValidatedFamilyPack,
} from './packSchema'
import {
  AGNES_CHAT_MODEL,
  AGNES_CHAT_URL,
  DEEPSEEK_CHAT_MODEL,
  DEEPSEEK_CHAT_URL,
  familyLlmLabel,
  type FamilyLlmProvider,
} from './providers'
import type { LevelScript } from '../types'

export type DirectPackResult = {
  title: string
  photoHints: string[]
  mainWords: string[]
  levels: LevelScript[]
  provider: FamilyLlmProvider
  model: string
  debug?: {
    levelCount: number
    mainWords: string[]
    model: string
    userContent: string
    responsePreview: string
  }
}

function chatEndpoint(llm: FamilyLlmProvider): { url: string; model: string } {
  if (llm === 'agnes') return { url: AGNES_CHAT_URL, model: AGNES_CHAT_MODEL }
  return { url: DEEPSEEK_CHAT_URL, model: DEEPSEEK_CHAT_MODEL }
}

async function callOnce(
  llm: FamilyLlmProvider,
  apiKey: string,
  story: string,
  date: string,
  levelCount: number,
): Promise<DirectPackResult> {
  const { url, model } = chatEndpoint(llm)
  const userContent = buildPackUserContent(story, date, levelCount)
  const doRequest = async () => {
    const r = await cloudJson(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: FAMILY_PACK_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      },
      timeoutMs: 240_000,
    })
    if (!r.ok && (r.status === 429 || /429|rate.?limit/i.test(String(r.error || '')))) {
      throw new Error(`${llm}_http_429:${(r.error || r.text).slice(0, 200)}`)
    }
    return r
  }
  const res = llm === 'agnes' ? await runAgnesCall(doRequest) : await doRequest()
  if (!res.ok) {
    if (res.error === 'llm_timeout' || isCloudTimeoutMessage(String(res.error || ''))) {
      throw new Error('llm_timeout')
    }
    throw new Error(`${llm}_http_${res.status}:${(res.error || res.text).slice(0, 200)}`)
  }
  const choices = res.data.choices
  const content =
    Array.isArray(choices) && choices[0] && typeof choices[0] === 'object'
      ? String((choices[0] as { message?: { content?: string } }).message?.content || '')
      : ''
  if (!content.trim()) throw new Error(`${llm}_empty`)
  const parsed = parseValidatedFamilyPack(content, date, levelCount)
  const levels = parsed.levels.map((e) => e.level as unknown as LevelScript)
  return {
    title: parsed.title,
    photoHints: parsed.photoHints,
    mainWords: parsed.mainWords,
    levels,
    provider: llm,
    model,
    debug: {
      levelCount: levels.length,
      mainWords: parsed.mainWords,
      model,
      userContent,
      responsePreview: content.slice(0, 2500),
    },
  }
}

/**
 * 把（可能是中文的）场景词翻译成适合图片模型的英文短句。
 * 失败返回 null，调用方回退原文（通义本身能处理中文）。
 */
export async function translateSceneToEnglish(input: {
  text: string
  apiKey: string
  llm: FamilyLlmProvider
}): Promise<string | null> {
  const text = input.text.trim()
  if (!text || !sceneNeedsTranslation(text)) return text || null
  const { url, model } = chatEndpoint(input.llm)
  const doRequest = async () =>
    cloudJson(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: {
        model,
        temperature: 0.2,
        max_tokens: 60,
        messages: [
          {
            role: 'system',
            content:
              'You translate a short children picture-book scene description into English. Reply with ONLY a concise English scene phrase of at most 12 words (e.g. "A sunny outdoor playground"). No quotes, no explanation.',
          },
          { role: 'user', content: text },
        ],
      },
      timeoutMs: 60_000,
    })
  const res = input.llm === 'agnes' ? await runAgnesCall(doRequest) : await doRequest()
  if (!res.ok) return null
  const choices = res.data.choices
  const content =
    Array.isArray(choices) && choices[0] && typeof choices[0] === 'object'
      ? String((choices[0] as { message?: { content?: string } }).message?.content || '')
      : ''
  const cleaned = content
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
  return cleaned || null
}

export async function generateFamilyPackDirect(input: {
  story: string
  date: string
  apiKey: string
  llm: FamilyLlmProvider
  levelCount?: number
}): Promise<DirectPackResult> {
  const story = input.story.trim()
  if (!story) throw new Error('story_required')
  const apiKey = input.apiKey.trim()
  if (!apiKey) throw new Error('api_key_required')
  const date = input.date || new Date().toISOString().slice(0, 10)
  const levelCount = clampPackLevelCount(input.levelCount ?? 4)
  const llm = input.llm

  const attempt = () => callOnce(llm, apiKey, story, date, levelCount)
  try {
    return await attempt()
  } catch (first) {
    const msg = first instanceof Error ? first.message : ''
    if (msg === 'api_key_required' || msg === 'story_required') throw first
    if (
      msg.startsWith('pack_levels_insufficient:') ||
      msg.startsWith('invalid_level') ||
      msg.includes('_http_') ||
      msg === 'llm_timeout' ||
      isCloudTimeoutMessage(msg)
    ) {
      try {
        return await attempt()
      } catch (second) {
        const s = second instanceof Error ? second.message : ''
        if (s === 'llm_timeout' || isCloudTimeoutMessage(s)) throw new Error('llm_timeout')
        throw second instanceof Error ? second : first
      }
    }
    throw first instanceof Error ? first : new Error('generate_failed')
  }
}

/** @deprecated 单关直连已由迷你 pack 取代；保留导出以免旧引用炸 */
export async function generateFamilyLevelDirect(input: {
  story: string
  date: string
  apiKey: string
  llm: FamilyLlmProvider
  minKeywords?: number
}): Promise<DirectPackResult> {
  return generateFamilyPackDirect({
    story: input.story,
    date: input.date,
    apiKey: input.apiKey,
    llm: input.llm,
    levelCount: input.minKeywords,
  })
}

export function llmBusyLabel(llm: FamilyLlmProvider): string {
  if (llm === 'agnes') {
    return `正在生成今日迷你关卡包（${familyLlmLabel(llm)}，约 3–5 关）…`
  }
  return `正在生成今日迷你关卡包（${familyLlmLabel(llm)}，约 3–5 关，可能需要 1–3 分钟）…`
}
