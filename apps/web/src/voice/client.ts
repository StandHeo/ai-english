import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { matchExpect } from './match'

const API_BASE = import.meta.env.VITE_API_BASE || ''

async function speakNative(text: string): Promise<void> {
  await TextToSpeech.stop()
  await TextToSpeech.speak({
    text,
    lang: 'en-US',
    rate: 0.9,
    pitch: 1.0,
    volume: 1.0,
    category: 'playback',
    queueStrategy: 0,
  })
}

async function speakWeb(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.9
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

/** App（Capacitor）走系统 TTS；手机/电脑浏览器仍用 speechSynthesis。 */
export async function speakBrowser(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await speakNative(text)
      return
    } catch {
      // 原生失败时再试 WebView speechSynthesis
    }
  }
  await speakWeb(text)
}

export async function cancelSpeak(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await TextToSpeech.stop()
    } catch {
      // ignore
    }
  }
  window.speechSynthesis?.cancel()
}

export async function requestTts(text: string): Promise<void> {
  // App 离线：直接本地朗读，不依赖电脑 API
  if (Capacitor.isNativePlatform()) {
    await speakBrowser(text)
    return
  }
  try {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.mode === 'browser' || data.text) {
        await speakBrowser(data.text || text)
        return
      }
    }
  } catch {
    // fall through
  }
  await speakBrowser(text)
}

export async function submitSpeech(opts: {
  blob?: Blob
  text?: string
  expect: string[]
}): Promise<{
  transcript: string
  matched: boolean
  source?: 'browser' | 'openai' | 'none' | 'local'
  hasAudio?: boolean
}> {
  const text = opts.text?.trim() || ''

  // 已有识别文字（Vosk / 浏览器 / 打字）：本地匹配，App 无需电脑 API
  if (text) {
    return {
      transcript: text,
      matched: matchExpect(text, opts.expect),
      source: 'local',
      hasAudio: Boolean(opts.blob),
    }
  }

  // 只有录音、没有文字：才需要服务端 ASR（网页联调 / Whisper）
  const form = new FormData()
  form.append('expect', opts.expect.join('|'))
  if (opts.blob) form.append('audio', opts.blob, 'speech.webm')

  const res = await fetch(`${API_BASE}/api/asr`, { method: 'POST', body: form })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(
      raw.startsWith('<!') || raw.startsWith('<')
        ? 'API 不可达（收到 HTML）。App 请用离线 Vosk；网页请确认电脑 API 在 8787'
        : `asr_failed: ${res.status}`,
    )
  }
  try {
    return JSON.parse(raw) as {
      transcript: string
      matched: boolean
      source?: 'browser' | 'openai' | 'none' | 'local'
      hasAudio?: boolean
    }
  } catch {
    throw new Error(
      'API 返回不是 JSON（常见于 App 访问不到电脑 /api）。有文字时应走本地匹配。',
    )
  }
}
