export type VoicePersona =
  | 'child-girl'
  | 'child-boy'
  | 'woman'
  | 'man'
  | 'elder-woman'
  | 'elder-man'

export type VoicePrefs = {
  persona: VoicePersona
  /** 0.5–1.5, 会叠在 persona 默认值上微调 */
  rateBoost: number
  pitchBoost: number
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
  { id: 'child-girl', label: '小女孩', hint: '更尖、更快一点，偏可爱' },
  { id: 'child-boy', label: '小男孩', hint: '略高、活泼' },
  { id: 'woman', label: '女声', hint: '清晰温和的成人女声' },
  { id: 'man', label: '男声', hint: '偏低沉的成人男声' },
  { id: 'elder-woman', label: '老奶奶', hint: '稍慢、柔和' },
  { id: 'elder-man', label: '老爷爷', hint: '稍慢、偏低' },
]

const PERSONA_BASE: Record<
  VoicePersona,
  { rate: number; pitch: number; preferFemale: boolean; preferYoung: boolean; preferElder: boolean }
> = {
  'child-girl': { rate: 0.92, pitch: 1.35, preferFemale: true, preferYoung: true, preferElder: false },
  'child-boy': { rate: 0.95, pitch: 1.18, preferFemale: false, preferYoung: true, preferElder: false },
  woman: { rate: 0.9, pitch: 1.08, preferFemale: true, preferYoung: false, preferElder: false },
  man: { rate: 0.88, pitch: 0.92, preferFemale: false, preferYoung: false, preferElder: false },
  'elder-woman': { rate: 0.78, pitch: 1.02, preferFemale: true, preferYoung: false, preferElder: true },
  'elder-man': { rate: 0.76, pitch: 0.85, preferFemale: false, preferYoung: false, preferElder: true },
}

export function defaultVoicePrefs(): VoicePrefs {
  return { persona: 'child-girl', rateBoost: 0, pitchBoost: 0 }
}

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultVoicePrefs()
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>
    const persona = VOICE_PERSONA_OPTIONS.some((o) => o.id === parsed.persona)
      ? (parsed.persona as VoicePersona)
      : 'child-girl'
    return {
      persona,
      rateBoost: clamp(Number(parsed.rateBoost) || 0, -0.25, 0.25),
      pitchBoost: clamp(Number(parsed.pitchBoost) || 0, -0.35, 0.35),
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
    pitch: clamp(base.pitch + prefs.pitchBoost, 0.6, 1.8),
    preferFemale: base.preferFemale,
    preferYoung: base.preferYoung,
    preferElder: base.preferElder,
  }
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
