export type VoicePersona =
  | 'child-girl'
  | 'child-boy'
  | 'woman'
  | 'man'
  | 'elder-woman'
  | 'elder-man'

/** App 原生朗读引擎：Piper（Sherpa）或手机系统 TTS */
export type TtsEngine = 'piper' | 'system'

export type VoicePrefs = {
  persona: VoicePersona
  /** 0.5–1.5, 会叠在 persona 默认值上微调 */
  rateBoost: number
  pitchBoost: number
  /** 仅 Capacitor App 生效；浏览器始终用 speechSynthesis */
  ttsEngine: TtsEngine
}

export type VoiceResolved = {
  lang: string
  rate: number
  pitch: number
  /** web SpeechSynthesisVoice name hint / native voice URI if known */
  voiceNameHint?: string
  preferFemale: boolean
  preferYoung: boolean
  preferElder: boolean
}

const KEY = 'ai-english-voice-prefs-v1'

export const VOICE_PERSONA_OPTIONS: { id: VoicePersona; label: string; hint: string }[] = [
  { id: 'child-girl', label: '小女孩', hint: 'Amy · 更高更快，偏可爱' },
  { id: 'child-boy', label: '小男孩', hint: 'Danny · 拉高音调近似男孩（非真童声）' },
  { id: 'woman', label: '女声', hint: 'Amy · 清晰温和' },
  { id: 'man', label: '男声', hint: 'Danny · 偏低沉' },
  { id: 'elder-woman', label: '老奶奶', hint: 'Amy · 稍慢柔和' },
  { id: 'elder-man', label: '老爷爷', hint: 'Danny · 稍慢偏低' },
]

const PERSONA_BASE: Record<
  VoicePersona,
  { rate: number; pitch: number; preferFemale: boolean; preferYoung: boolean; preferElder: boolean }
> = {
  // Amy=女声线；Danny=男声线。小男孩靠 Danny + 很高 pitch 近似（库内无真童声）
  'child-girl': { rate: 1.1, pitch: 1.45, preferFemale: true, preferYoung: true, preferElder: false },
  'child-boy': { rate: 1.12, pitch: 1.58, preferFemale: false, preferYoung: true, preferElder: false },
  woman: { rate: 0.95, pitch: 1.05, preferFemale: true, preferYoung: false, preferElder: false },
  man: { rate: 0.88, pitch: 0.85, preferFemale: false, preferYoung: false, preferElder: false },
  'elder-woman': { rate: 0.78, pitch: 0.98, preferFemale: true, preferYoung: false, preferElder: true },
  'elder-man': { rate: 0.74, pitch: 0.78, preferFemale: false, preferYoung: false, preferElder: true },
}

export const TTS_ENGINE_OPTIONS: { id: TtsEngine; label: string; hint: string }[] = [
  {
    id: 'piper',
    label: 'Piper（推荐）',
    hint: 'App 内离线神经音；失败仍会降级系统音',
  },
  {
    id: 'system',
    label: '系统 TTS',
    hint: '手机自带朗读，不加载 Piper 模型',
  },
]

export function defaultVoicePrefs(): VoicePrefs {
  return { persona: 'child-girl', rateBoost: 0, pitchBoost: 0, ttsEngine: 'piper' }
}

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultVoicePrefs()
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>
    const persona = VOICE_PERSONA_OPTIONS.some((o) => o.id === parsed.persona)
      ? (parsed.persona as VoicePersona)
      : 'child-girl'
    const ttsEngine: TtsEngine = parsed.ttsEngine === 'system' ? 'system' : 'piper'
    return {
      persona,
      rateBoost: clamp(Number(parsed.rateBoost) || 0, -0.25, 0.25),
      pitchBoost: clamp(Number(parsed.pitchBoost) || 0, -0.35, 0.35),
      ttsEngine,
    }
  } catch {
    return defaultVoicePrefs()
  }
}

export function saveVoicePrefs(prefs: VoicePrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs))
}

export function resolveVoice(prefs: VoicePrefs = loadVoicePrefs()): VoiceResolved {
  const base = PERSONA_BASE[prefs.persona]
  return {
    lang: 'en-US',
    rate: clamp(base.rate + prefs.rateBoost, 0.55, 1.35),
    pitch: clamp(base.pitch + prefs.pitchBoost, 0.6, 1.85),
    preferFemale: base.preferFemale,
    preferYoung: base.preferYoung,
    preferElder: base.preferElder,
  }
}

/** Piper 音色：女声/女孩 → Amy；男声/男孩 → Danny */
export type PiperVoiceId = 'amy' | 'danny'

export function piperVoiceForPersona(persona: VoicePersona): PiperVoiceId {
  return PERSONA_BASE[persona].preferFemale ? 'amy' : 'danny'
}

export function piperVoiceForPrefs(prefs: VoicePrefs = loadVoicePrefs()): PiperVoiceId {
  return piperVoiceForPersona(prefs.persona)
}

/**
 * Piper 播放参数：小男孩在 Danny 上额外抬高 pitch（成人男声近似童声）。
 */
export function piperSpeakTuning(prefs: VoicePrefs = loadVoicePrefs()): {
  voiceId: PiperVoiceId
  rate: number
  pitch: number
} {
  const resolved = resolveVoice(prefs)
  const voiceId = piperVoiceForPersona(prefs.persona)
  let rate = resolved.rate
  let pitch = resolved.pitch
  if (prefs.persona === 'child-boy') {
    rate = clamp(rate * 1.06, 0.55, 1.35)
    pitch = clamp(pitch * 1.12, 0.6, 1.85)
  }
  return { voiceId, rate, pitch }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

const FEMALE_HINTS =
  /female|woman|girl|samantha|victoria|karen|moira|fiona|tessa|zira|susan|hazel|linda|heather|emma|ava|siri|jenny|aria|sara|catherine|allison|nicky|princess/i
const MALE_HINTS =
  /male|man|boy|daniel|david|mark|fred|alex(?!a)|tom|james|john|arthur|ravi|george|bruce|aaron|guy|nathan/i
const CHILD_HINTS = /child|kid|junior|boy|girl|princess|nicky/i
const ELDER_HINTS = /grandma|grandpa|elder|senior|old/i

export function pickWebVoice(
  voices: SpeechSynthesisVoice[],
  resolved: VoiceResolved,
): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => /^en(-|_)/i.test(v.lang) || /english/i.test(v.name))
  const pool = en.length ? en : voices
  if (!pool.length) return null

  const scored = pool.map((v) => {
    let score = 0
    const name = `${v.name} ${v.lang}`
    if (/en-US/i.test(v.lang)) score += 2
    if (/en-GB/i.test(v.lang)) score += 1
    if (resolved.preferFemale && FEMALE_HINTS.test(name)) score += 5
    if (!resolved.preferFemale && MALE_HINTS.test(name)) score += 5
    if (resolved.preferFemale && MALE_HINTS.test(name)) score -= 3
    if (!resolved.preferFemale && FEMALE_HINTS.test(name)) score -= 3
    if (resolved.preferYoung && CHILD_HINTS.test(name)) score += 4
    if (resolved.preferElder && ELDER_HINTS.test(name)) score += 4
    if (resolved.preferYoung && ELDER_HINTS.test(name)) score -= 2
    // Google / natural voices often sound less flat
    if (/google|natural|premium|enhanced|neural/i.test(name)) score += 2
    return { v, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.v || null
}

export async function loadWebVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return []
  const current = window.speechSynthesis.getVoices()
  if (current.length) return current
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done)
      resolve(window.speechSynthesis.getVoices())
    }
    window.speechSynthesis.addEventListener('voiceschanged', done)
    window.setTimeout(done, 500)
  })
}
