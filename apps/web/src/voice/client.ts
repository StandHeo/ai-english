import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { apiUrl } from '../api/base'
import { matchExpect } from './match'
import {
  loadVoicePrefs,
  loadWebVoices,
  pickWebVoice,
  resolveVoice,
  type VoiceResolved,
} from './prefs'

async function speakNative(text: string, resolved: VoiceResolved): Promise<void> {
  await TextToSpeech.stop()
  let voiceURI: string | undefined
  try {
    const { voices } = await TextToSpeech.getSupportedVoices()
    const en = voices.filter((v) => /^en/i.test(v.lang || ''))
    const pool = en.length ? en : voices
    const picked = pickNativeVoice(pool, resolved)
    voiceURI = picked?.voiceURI
  } catch {
    // some devices lack voice listing
  }
  await TextToSpeech.speak({
    text,
    lang: resolved.lang,
    rate: resolved.rate,
    pitch: resolved.pitch,
    volume: 1.0,
    category: 'playback',
    queueStrategy: 0,
    ...(voiceURI ? { voiceURI } : {}),
  })
}

type NativeVoice = { voiceURI: string; name?: string; lang?: string }

function pickNativeVoice(voices: NativeVoice[], resolved: VoiceResolved): NativeVoice | null {
  if (!voices.length) return null
  // Reuse web scoring via fake SpeechSynthesisVoice-like objects
  const fake = voices.map(
    (v) =>
      ({
        voiceURI: v.voiceURI,
        name: v.name || v.voiceURI,
        lang: v.lang || 'en-US',
        localService: true,
        default: false,
      }) as SpeechSynthesisVoice,
  )
  const picked = pickWebVoice(fake, resolved)
  if (!picked) return voices[0]
  return voices.find((v) => v.voiceURI === picked.voiceURI) || voices[0]
}

async function speakWeb(text: string, resolved: VoiceResolved): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }
    void loadWebVoices().then((voices) => {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = resolved.lang
      u.rate = resolved.rate
      u.pitch = resolved.pitch
      const voice = pickWebVoice(voices, resolved)
      if (voice) {
        u.voice = voice
        u.lang = voice.lang || resolved.lang
      }
      u.onend = () => resolve()
      u.onerror = () => resolve()
      window.speechSynthesis.speak(u)
    })
  })
}

/** App（Capacitor）走系统 TTS；手机/电脑浏览器仍用 speechSynthesis。 */
export async function speakBrowser(text: string): Promise<void> {
  const resolved = resolveVoice(loadVoicePrefs())
  if (Capacitor.isNativePlatform()) {
    try {
      await speakNative(text, resolved)
      return
    } catch {
      // 原生失败时再试 WebView speechSynthesis
    }
  }
  await speakWeb(text, resolved)
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
    const res = await fetch(apiUrl('/api/tts'), {
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

  const res = await fetch(apiUrl('/api/asr'), { method: 'POST', body: form })
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
