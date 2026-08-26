import { cloudJson, isCloudTimeoutMessage } from '../api/cloudHttp'
import { runAgnesCall } from './agnesRateLimit'
import {
  AGNES_CHAT_MODEL,
  AGNES_CHAT_URL,
  DEEPSEEK_CHAT_MODEL,
  DEEPSEEK_CHAT_URL,
  familyLlmLabel,
  type FamilyLlmProvider,
} from './providers'
import {
  FAMILY_LEVEL_SYSTEM_PROMPT,
  buildLevelUserContent,
  clampMinKeywords,
  parseValidatedFamilyLevel,
  type ParsedFamilyLevel,
} from './levelSchema'

export type DirectLevelResult = ParsedFamilyLevel & {
  provider: FamilyLlmProvider
  model: string
  debug?: {
    minKeywords: number
    keywordCount: number
    keywords: string[]
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
  minKeywords: number,
): Promise<DirectLevelResult> {
  const { url, model } = chatEndpoint(llm)
  const userContent = buildLevelUserContent(story, date, minKeywords)
  const doRequest = async () => {
    const r = await cloudJson(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: FAMILY_LEVEL_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      },
      // App 直连弱网时 Agnes/DeepSeek 常 >2 分钟才回首包
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
  const parsed = parseValidatedFamilyLevel(content, date, minKeywords)
  return {
    ...parsed,
    provider: llm,
    model,
    debug: {
      minKeywords,
      keywordCount: parsed.keywords.length,
      keywords: parsed.keywords,
      model,
      userContent,
      responsePreview: content.slice(0, 2500),
    },
  }
}

export async function generateFamilyLevelDirect(input: {
  story: string
  date: string
  apiKey: string
  llm: FamilyLlmProvider
  minKeywords?: number
}): Promise<DirectLevelResult> {
  const story = input.story.trim()
  if (!story) throw new Error('story_required')
  const apiKey = input.apiKey.trim()
  if (!apiKey) throw new Error('api_key_required')
  const date = input.date || new Date().toISOString().slice(0, 10)
  const minKeywords = clampMinKeywords(input.minKeywords ?? 9)
  const llm = input.llm

  const attempt = () => callOnce(llm, apiKey, story, date, minKeywords)
  try {
    return await attempt()
  } catch (first) {
    const msg = first instanceof Error ? first.message : ''
    if (msg === 'api_key_required' || msg === 'story_required') throw first
    if (
      msg.startsWith('keywords_insufficient:') ||
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

export function llmBusyLabel(llm: FamilyLlmProvider): string {
  if (llm === 'agnes') {
    return `正在生成关卡（${familyLlmLabel(llm)}，免费档约 20 次/分钟，可能稍慢）…`
  }
  return `正在生成关卡（${familyLlmLabel(llm)}，可能需要 1–3 分钟）…`
}
