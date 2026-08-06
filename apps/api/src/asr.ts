export type AsrInput = {
  audio?: Buffer
  mimeType?: string
  forcedText?: string
  expectHint?: string[]
}

/**
 * Vendor-agnostic ASR.
 * - forcedText：浏览器语音识别或家长打字
 * - mock：仅在确有音频时，用期望词模拟成功（方便无密钥联调）；无音频/无文本则返回空
 * - openai：Whisper（需 ASR_API_KEY）
 */
export async function recognizeSpeech(input: AsrInput): Promise<string> {
  if (input.forcedText && input.forcedText.trim()) {
    return input.forcedText.trim()
  }

  const provider = process.env.ASR_PROVIDER || 'mock'
  const hasAudio = Boolean(input.audio && input.audio.length > 0)

  if (provider === 'mock') {
    if (!hasAudio) return ''
    if (input.expectHint?.[0]) return input.expectHint[0]
    return ''
  }

  if (provider === 'openai' || provider === 'whisper') {
    if (!hasAudio) return ''
    return whisperOpenAI(input.audio!, input.mimeType || 'audio/webm')
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
