export type IconColorHint = {
  word: string
  fg: string
  bg: string
}

export const FAMILY_LEVEL_SYSTEM_PROMPT = `You are a kids English oral-adventure level designer for ages 4-6.
Given a Chinese (or mixed) family diary about a child's day, output ONE level as JSON only (no markdown).
Schema:
{
  "level": {
    "id": string (family-YYYYMMDD-word),
    "approved": true,
    "theme": "family",
    "title": short English title,
    "target_words": [4-9 short English nouns kids can say],
    "scene": { "setting": string, "image": "placeholder", "character": "bunny" },
    "beats": [3-6 items],
    "reward": { "sticker": string, "stickerImage": "placeholder", "stars": 1 }
  },
  "photoHints": [2-5 short Chinese or English phrases for searching the phone photo album],
  "iconColors": [
    {
      "word": "same as a target_word or option id",
      "fg": "#E07A3D",
      "bg": "#FFF3E0"
    }
  ]
}
Beat types: "introduce" | "ask" | "find".
Each beat needs "type" and "npc_say" (simple English, max ~8 words).
ask beats MUST have "expect" (array of short phrases), "hint_say", "success_say", and "fallback": { "type":"picture_choice", "options":[ {id, image:"placeholder", correct:true}, {id, image:"placeholder", correct:false} ] }.
find beats MUST have "options" with at least 2 items and one correct.
CRITICAL vocabulary rule: Across target_words PLUS every picture-option "id", the UNIQUE short English keywords MUST meet the minimum count given in the user message (default 9). Use many distinct concrete nouns as option ids (park, slide, bus, ball, friend, home, tree, duck, cake, …). Avoid repeating the same id.
Prefer words like park, slide, rice, friend, ball, bus, home — avoid long phrases.
Use image:"placeholder" everywhere; photos are attached later.
Do NOT include beep_talk (optional kid-robot tail dialogue is authored only for official packs).
iconColors: give ONE entry per target_word (and important option ids if useful). Colors must be warm, soft, kid-friendly hex pairs (peach, coral, sky, mint, sunshine, lavender). fg = icon fill (medium saturation), bg = light pastel card background. Never use neon, pure black, or pure white as fg.`

const HEX = /^#([0-9A-Fa-f]{6})$/

export function clampMinKeywords(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 9
  return Math.min(12, Math.max(3, Math.floor(v)))
}

export function collectLevelKeywords(level: unknown): string[] {
  if (!level || typeof level !== 'object') return []
  const L = level as Record<string, unknown>
  const set = new Set<string>()
  const add = (raw: string) => {
    const s = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .trim()
    if (!s) return
    const token = s.split(/[\s-]+/).filter(Boolean)[0]
    if (token && token.length >= 2 && token.length <= 16) set.add(token)
  }
  if (Array.isArray(L.target_words)) {
    for (const w of L.target_words) add(String(w))
  }
  const beats = Array.isArray(L.beats) ? L.beats : []
  for (const raw of beats) {
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Record<string, unknown>
    let opts: unknown[] = []
    if (Array.isArray(b.options)) opts = b.options
    else if (b.fallback && typeof b.fallback === 'object') {
      const fb = (b.fallback as { options?: unknown }).options
      if (Array.isArray(fb)) opts = fb
    }
    for (const o of opts) {
      if (!o || typeof o !== 'object') continue
      add(String((o as { id?: string }).id || ''))
    }
  }
  return [...set]
}

export function normalizeIconColors(raw: unknown): IconColorHint[] {
  if (!Array.isArray(raw)) return []
  const out: IconColorHint[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const word = String(o.word || o.id || '')
      .trim()
      .toLowerCase()
    let fg = String(o.fg || o.color || o.fill || '').trim()
    let bg = String(o.bg || o.background || '').trim()
    if (!word) continue
    if (!HEX.test(fg) || !HEX.test(bg)) continue
    fg = fg.toUpperCase()
    bg = bg.toUpperCase()
    out.push({ word, fg, bg })
  }
  return out.slice(0, 8)
}

export function validateFamilyLevel(level: unknown): string | null {
  if (!level || typeof level !== 'object') return 'level_not_object'
  const L = level as Record<string, unknown>
  if (typeof L.id !== 'string' || !L.id) return 'missing_id'
  if (L.approved !== true && L.approved !== false) return 'missing_approved'
  if (typeof L.title !== 'string') return 'missing_title'
  if (!Array.isArray(L.target_words) || L.target_words.length < 1 || L.target_words.length > 12) {
    return 'target_words'
  }
  if (!L.scene || typeof L.scene !== 'object') return 'scene'
  const scene = L.scene as Record<string, unknown>
  if (typeof scene.setting !== 'string' || typeof scene.image !== 'string') return 'scene_fields'
  if (!Array.isArray(L.beats) || L.beats.length < 3 || L.beats.length > 6) return 'beats_count'
  for (let i = 0; i < L.beats.length; i++) {
    const b = L.beats[i] as Record<string, unknown>
    if (!b || typeof b.type !== 'string' || typeof b.npc_say !== 'string') return `beat_${i}_base`
    if (b.type === 'ask') {
      if (!Array.isArray(b.expect) || b.expect.length < 1) return `beat_${i}_expect`
      const fb = b.fallback as Record<string, unknown> | undefined
      if (!fb || fb.type !== 'picture_choice' || !Array.isArray(fb.options) || fb.options.length < 2) {
        return `beat_${i}_fallback`
      }
    }
    if (b.type === 'find') {
      const opts = (b.options as unknown[]) || ((b.fallback as Record<string, unknown>)?.options as unknown[])
      if (!Array.isArray(opts) || opts.length < 2) return `beat_${i}_find_opts`
      if (!opts.some((o) => (o as { correct?: boolean })?.correct)) return `beat_${i}_find_correct`
    }
  }
  const reward = L.reward as Record<string, unknown> | undefined
  if (!reward || typeof reward.sticker !== 'string') return 'reward'
  return null
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fence ? fence[1].trim() : trimmed
  return JSON.parse(raw)
}

export function buildLevelUserContent(story: string, date: string, minKeywords: number): string {
  return `Date: ${date}
Minimum UNIQUE English keywords required: ${minKeywords}
(This number is also the target image/slot count for family diary art.)
(Count = unique short nouns from target_words + every picture option id. Must be >= ${minKeywords}.)

Child day story:
${story}

If the story is thin, still invent plausible related kid nouns from a typical day so the keyword count is met.
Return JSON only.`
}

export type ParsedFamilyLevel = {
  level: Record<string, unknown>
  photoHints: string[]
  iconColors: IconColorHint[]
  keywords: string[]
}

export function parseValidatedFamilyLevel(
  content: string,
  date: string,
  minKeywords: number,
): ParsedFamilyLevel {
  const parsed = extractJson(content) as {
    level?: unknown
    photoHints?: unknown
    iconColors?: unknown
  }
  const level = (parsed.level || parsed) as Record<string, unknown>
  const err = validateFamilyLevel(level)
  if (err) throw new Error(`invalid_level:${err}`)
  const hints = Array.isArray(parsed.photoHints)
    ? parsed.photoHints.map(String).filter(Boolean)
    : ['今天', '好玩']
  if (typeof level.id !== 'string' || !String(level.id).startsWith('family-')) {
    level.id = `family-${date.replace(/-/g, '')}-day`
  }
  level.approved = true
  level.theme = 'family'
  delete level.beep_talk
  const keywords = collectLevelKeywords(level)
  if (keywords.length < minKeywords) {
    throw new Error(`keywords_insufficient:${keywords.length}:${minKeywords}`)
  }
  let iconColors = normalizeIconColors(parsed.iconColors)
  if (!iconColors.length && Array.isArray(level.target_words)) {
    const defaults = [
      { fg: '#E07A3D', bg: '#FFF3E0' },
      { fg: '#3D9B6E', bg: '#E8F6EE' },
      { fg: '#5B8FD9', bg: '#E8F2FF' },
    ]
    iconColors = level.target_words.slice(0, minKeywords).map((w, i) => ({
      word: String(w).toLowerCase(),
      fg: defaults[i % defaults.length].fg,
      bg: defaults[i % defaults.length].bg,
    }))
  }
  return {
    level,
    photoHints: hints.slice(0, 5),
    iconColors,
    keywords,
  }
}
