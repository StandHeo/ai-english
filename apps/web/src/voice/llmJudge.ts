import { cloudJson } from '../api/cloudHttp'
import { apiUrl } from '../api/base'
import { runAgnesCall } from '../family/agnesRateLimit'
import {
  AGNES_CHAT_MODEL,
  AGNES_CHAT_URL,
  DEEPSEEK_CHAT_MODEL,
  DEEPSEEK_CHAT_URL,
} from '../family/providers'
import { getLlmApiKey, getLlmProvider } from '../family/store'

/**
 * 孩子口语判定提示词：
 * - 说话人是 4-6 岁、英语第二语言的孩子，发音不准是常态
 * - 文字来自离线小模型（Vosk）转写，错音漏音常见
 * - 判定要按「发音是否接近期望词」而不是字符串相等
 */
export const VOICE_JUDGE_SYSTEM_PROMPT = `你是儿童英语口语判听员。说话人是 4-6 岁的孩子（英语第二语言），刚跟读一个英语单词或短语。语音由离线小型识别模型转成文字，转写结果经常不准。

已知转写错误形态（这些都可能是孩子说对了）：
- 发音近似替换：b/p、g/k、d/t、th/s/f、r/l、n/l、长短元音（如 park→palk/pack，bus→boss/bass，three→tree，rabbit→wabbit）
- 漏音或多音：park→par，apple→a-pou，banana→nana
- 混入多余语气词、冠词或中文：uh、um、the、"苹果"
- 拼写式错误、大小写与标点噪声

判定规则：
- true：转写与任一期望词发音相近、是其常见误听，或包含该词（允许少量多余词）
- false：转写与所有期望词明显无关（说的是别的词、完全不像、或根本没在说英语）

只输出 JSON，不要解释：{"matched": true/false, "word": "命中的期望词，没有则为 null"}`

export type VoiceJudgeResult = {
  matched: boolean
  word?: string
  /** null = 判定服务不可用，调用方回退到本地严格匹配结果 */
  judged: boolean
}

function parseJudgeContent(content: string): VoiceJudgeResult | null {
  const fence = content.match(/\{[\s\S]*\}/)
  if (!fence) return null
  try {
    const data = JSON.parse(fence[0]) as { matched?: unknown; word?: unknown }
    if (typeof data.matched !== 'boolean') return null
    return {
      matched: data.matched,
      word: typeof data.word === 'string' && data.word !== 'null' ? data.word : undefined,
      judged: true,
    }
  } catch {
    return null
  }
}

async function judgeDirect(transcript: string, expect: string[]): Promise<VoiceJudgeResult | null> {
  const llm = getLlmProvider()
  const apiKey = getLlmApiKey().trim()
  if (!apiKey) return null
  const { url, model } =
    llm === 'agnes'
      ? { url: AGNES_CHAT_URL, model: AGNES_CHAT_MODEL }
      : { url: DEEPSEEK_CHAT_URL, model: DEEPSEEK_CHAT_MODEL }
  const doRequest = () =>
    cloudJson(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          temperature: 0,
          max_tokens: 40,
          messages: [
            { role: 'system', content: VOICE_JUDGE_SYSTEM_PROMPT },
            { role: 'user', content: buildJudgeUserContent(transcript, expect) },
          ],
        },
        timeoutMs: 15_000,
      },
    )
  const res = llm === 'agnes' ? await runAgnesCall(doRequest) : await doRequest()
  if (!res.ok) return null
  const content = String(
    (res.data.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message
      ?.content || '',
  )
  return parseJudgeContent(content)
}

export function buildJudgeUserContent(transcript: string, expect: string[]): string {
  return `期望答案（第一个是主答案）：${expect.join(' | ')}
语音转写：${transcript}`
}

/**
 * 本地严格匹配失败后的 LLM 模糊判定。
 * - App：用家庭设置里的 LLM Key 直连
 * - 浏览器：走电脑 API 代理 /api/voice-judge
 * - 任何失败返回 null（调用方沿用本地匹配结果），绝不阻塞流程
 */
export async function judgeTranscriptWithLlm(
  transcript: string,
  expect: string[],
): Promise<VoiceJudgeResult | null> {
  const t = transcript.trim()
  if (!t || expect.length === 0) return null

  const proxy = await judgeViaProxy(t, expect)
  if (proxy) return proxy

  try {
    return await judgeDirect(t, expect)
  } catch {
    return null
  }
}

async function judgeViaProxy(
  transcript: string,
  expect: string[],
): Promise<VoiceJudgeResult | null> {
  try {
    const res = await fetch(apiUrl('/api/voice-judge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, expect }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { matched?: boolean; judged?: boolean }
    if (!data.judged || typeof data.matched !== 'boolean') return null
    return { matched: data.matched, judged: true }
  } catch {
    return null
  }
}
