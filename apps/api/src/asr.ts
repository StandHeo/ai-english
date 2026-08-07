export type AsrInput = {
  audio?: Buffer
  mimeType?: string
  forcedText?: string
  expectHint?: string[]
}

export type AsrResult = {
  text: string
  /** browser=前端识别/打字；openai=云端；none=没有真实转写 */
  source: 'browser' | 'openai' | 'none'
  hasAudio: boolean
}

/**
 * Vendor-agnostic ASR.
 * - forcedText：浏览器语音识别或家长打字（真实文本）
 * - mock：不再用期望词假装听懂；没有文本就返回空，避免联调误导
 * - openai：Whisper（需 ASR_API_KEY）
 */
export async function recognizeSpeech(input: AsrInput): Promise<AsrResult> {
  const hasAudio = Boolean(input.audio && input.audio.length > 0)

  if (input.forcedText && input.forcedText.trim()) {
    return {
      text: input.forcedText.trim(),
      source: 'browser',
      hasAudio,
    }
  }

  const provider = process.env.ASR_PROVIDER || 'mock'

  if (provider === 'mock') {
    // 旧行为会在有音频时直接返回 expectHint[0]（如 banana），造成「没听也算对」。
    // 真实听写请依赖浏览器 SpeechRecognition，或配置 openai。
    return { text: '', source: 'none', hasAudio }
  }

  if (provider === 'openai' || provider === 'whisper') {
    if (!hasAudio) return { text: '', source: 'none', hasAudio }
    const text = await whisperOpenAI(input.audio!, input.mimeType || 'audio/webm')
    return { text, source: 'openai', hasAudio }
  }

  throw new Error(
    `ASR provider "${provider}" not configured. Use mock / openai, or send text from browser speech recognition.`,
  )
}

async function whisperOpenAI(audio: Buffer, mimeType: string): Promise<string> {
  const key = process.env.ASR_API_KEY || process.env.OPENAI_API_KEY
  if (!key) throw new Error('ASR_API_KEY missing for openai ASR')

  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'speech.webm')
  form.append('model', process.env.ASR_MODEL || 'whisper-1')
  form.append('language', 'en')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`openai_asr_failed: ${res.status} ${body}`)
  }
  const data = (await res.json()) as { text?: string }
  return (data.text || '').trim()
}
