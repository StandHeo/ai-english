import { runAgnesCall } from './agnesRateLimit.js'

/** 孩子口语判定提示词：说话人 4-6 岁、离线小模型转写常有错音漏音 */
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

export function buildJudgeUserContent(transcript: string, expect: string[]): string {
  return `期望答案（第一个是主答案）：${expect.join(' | ')}
语音转写：${transcript}`
}

export type VoiceJudgeResult = { matched: boolean; word?: string }

export function parseJudgeContent(content: string): VoiceJudgeResult | null {
  const fence = content.match(/\{[\s\S]*\}/)
  if (!fence) return null
  try {
    const data = JSON.parse(fence[0]) as { matched?: unknown; word?: unknown }
    if (typeof data.matched !== 'boolean') return null
    return {
      matched: data.matched,
      word: typeof data.word === 'string' && data.word !== 'null' ? data.word : undefined,
    }
  } catch {
    return null
  }
}

function resolveLlm(): { url: string; model: string; key: string } | null {
  const provider = (process.env.FAMILY_LLM_PROVIDER || 'deepseek').trim().toLowerCase()
  if (provider === 'agnes') {
    const key =
      process.env.AGNES_API_KEY?.trim() || process.env.FAMILY_LLM_API_KEY?.trim() || ''
    if (!key) return null
    return {
      url: 'https://apihub.agnes-ai.com/v1/chat/completions',
      model: process.env.AGNES_LLM_MODEL?.trim() || 'agnes-2.5-flash',
      key,
    }
  }
  const key =
    process.env.DEEPSEEK_API_KEY?.trim() || process.env.FAMILY_LLM_API_KEY?.trim() || ''
  if (!key) return null
  return {
    url: 'https://api.deepseek.com/chat/completions',
    model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
    key,
  }
}

/**
 * LLM 模糊判定孩子口语。无 Key / 任何失败返回 { judged: false }，
 * 调用方沿用本地严格匹配结果，绝不阻塞。
 */
export async function judgeTranscript(
  transcript: string,
  expect: string[],
): Promise<VoiceJudgeResult & { judged: boolean }> {
  const cfg = resolveLlm()
  if (!cfg || !transcript.trim() || expect.length === 0) return { judged: false, matched: false }

  const call = () =>
    fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 40,
        messages: [
          { role: 'system', content: VOICE_JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: buildJudgeUserContent(transcript, expect) },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    })

  try {
    const res = await (cfg.url.includes('agnes') ? runAgnesCall(call) : call())
    if (!res.ok) return { judged: false, matched: false }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content || ''
    const parsed = parseJudgeContent(content)
    return parsed ? { ...parsed, judged: true } : { judged: false, matched: false }
  } catch {
    return { judged: false, matched: false }
  }
}
