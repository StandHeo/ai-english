/**
 * 家庭迷你 pack：一次生成 3–5 关，每关约一词一景（对齐官方 fruit 单关结构）。
 */
import {
  ensureIntroShowBeat,
  extractJson,
  normalizeFamilyLevel,
  validateFamilyLevel,
  type IconColorHint,
} from './levelSchema'

export { clampMinKeywords as clampPackLevelCountRequest } from './levelSchema'

export const FAMILY_PACK_SYSTEM_PROMPT = `You are a kids English oral-adventure designer for ages 4-6.
Given a Chinese (or mixed) family diary about a child's day, output ONE mini CONTENT PACK as JSON only (no markdown).
The pack is like the official "fruit forest" pack: several short levels, each focused on ONE main English noun with its own scene.

CRITICAL beat field names (do NOT invent other names):
- Every beat MUST have "type" and "npc_say" (never use "question" instead of npc_say).
- The FIRST beat of EVERY level MUST be an introduce beat with show (main word picture):
  {"type":"introduce","show":"placeholder","npc_say":"Look! park!","hint_say":"park"}
- introduce and ask beats MUST have "show":"placeholder" (picture of the word).
- ask beat example:
  {"type":"ask","show":"placeholder","npc_say":"Say park!","expect":["park"],"hint_say":"Park!","success_say":"Yes!",
   "fallback":{"type":"picture_choice","options":[
     {"id":"park","image":"placeholder","correct":true},
     {"id":"bus","image":"placeholder","correct":false}
   ]}}
- find beat example:
  {"type":"find","npc_say":"Find the park!","hint_say":"Park!","success_say":"Yes!",
   "options":[
     {"id":"park","image":"placeholder","correct":true},
     {"id":"cake","image":"placeholder","correct":false}
   ]}
- Do NOT use correct_id / label-only options. Each option needs id, image:"placeholder", correct boolean.
- expect MUST be an array of strings, not a single string.

Schema:
{
  "pack": { "title": short English pack title },
  "levels": [
    {
      "level": {
        "id": string (family-YYYYMMDD-word),
        "approved": true,
        "theme": "family",
        "title": short English title for THIS level,
        "target_words": [ONE short English noun kids can say],
        "scene": {
          "setting": short place phrase like official levels (e.g. "A sunny outdoor swimming pool" or "阳光下的游泳池"), max ~12 words / one short sentence,
          "image": "placeholder",
          "character": "bunny"
        },
        "beats": [3-6 items],
        "reward": { "sticker": string, "stickerImage": "placeholder", "stars": 1 }
      },
      "photoHints": [0-3 short phrases for album search]
    }
  ]
}

Rules:
- Output exactly the number of levels requested in the user message (between 3 and 5).
- Each level MUST focus on a DIFFERENT main word in target_words[0].
- scene.setting MUST be a short PLACE / atmosphere line (Chinese or English OK). Do NOT paste the whole diary into setting.
- Beat types: "introduce" | "ask" | "find". Keep npc_say simple English (max ~8 words).
- FIRST beat of every level: introduce with show. Then alternate ask / find beats.
- ask beats MUST have expect (array), hint_say, success_say, and fallback.picture_choice with >=2 options.
- find beats MUST have options with >=2 items and one correct:true.
- Distractor option ids may reuse other levels' main words or simple nouns (bus, cake, home, tree…).
- Use image:"placeholder" everywhere.
- Do NOT include beep_talk.
- Prefer concrete kid nouns from the diary; if the story is thin, invent plausible related nouns so the level count is met.`

export function buildPackUserContent(story: string, date: string, levelCount: number): string {
  const n = Math.min(5, Math.max(3, Math.floor(levelCount)))
  return `Date: ${date}
Number of levels in the mini pack: ${n}
(Each level = one main English word + its own short scene.setting, like fruit-01-apple / fruit-02-banana.)

Child day story:
${story}

Return JSON only with exactly ${n} levels.`
}

export function clampPackLevelCount(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 4
  return Math.min(5, Math.max(3, Math.floor(v)))
}

export type ParsedFamilyPack = {
  title: string
  levels: Array<{
    level: Record<string, unknown>
    photoHints: string[]
  }>
  photoHints: string[]
  mainWords: string[]
}

export function parseValidatedFamilyPack(
  content: string,
  date: string,
  levelCount: number,
): ParsedFamilyPack {
  const want = clampPackLevelCount(levelCount)
  const parsed = extractJson(content) as {
    pack?: { title?: unknown }
    title?: unknown
    levels?: unknown
    level?: unknown
  }

  // 兼容误返回单关：包成 1 关再报关数不足
  let rawLevels: unknown[] = []
  if (Array.isArray(parsed.levels)) rawLevels = parsed.levels
  else if (parsed.level) rawLevels = [{ level: parsed.level }]

  if (rawLevels.length < 3) {
    throw new Error(`pack_levels_insufficient:${rawLevels.length}:${want}`)
  }

  const title =
    (parsed.pack && typeof parsed.pack.title === 'string' && parsed.pack.title.trim()) ||
    (typeof parsed.title === 'string' && parsed.title.trim()) ||
    'My Day'

  const idDate = date.replace(/-/g, '')
  const levels: ParsedFamilyPack['levels'] = []
  const mainWords: string[] = []
  const allHints: string[] = []
  const seenWords = new Set<string>()

  for (const raw of rawLevels.slice(0, want)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as { level?: unknown; photoHints?: unknown }
    let level = (entry.level || raw) as Record<string, unknown>
    level = normalizeFamilyLevel(level)
    ensureIntroShowBeat(level)
    const err = validateFamilyLevel(level)
    if (err) throw new Error(`invalid_level:${err}`)

    const words = Array.isArray(level.target_words)
      ? level.target_words.map(String)
      : []
    const main = (words[0] || 'day')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 16) || 'day'
    if (seenWords.has(main)) {
      // 允许重复词但改 id 后缀
    }
    seenWords.add(main)
    mainWords.push(main)

    if (typeof level.id !== 'string' || !String(level.id).startsWith('family-')) {
      level.id = `family-${idDate}-${main}`
    }
    level.approved = true
    level.theme = 'family'
    delete level.beep_talk

    // 强制主词优先：保留首词，多余词可留着但不作为多关凑词依据
    if (!Array.isArray(level.target_words) || level.target_words.length < 1) {
      level.target_words = [main]
    } else {
      level.target_words = [String(level.target_words[0])]
    }

    const scene = level.scene as Record<string, unknown>
    if (scene && typeof scene.setting === 'string') {
      const setting = scene.setting.trim()
      // 过长则截断，避免日记复述
      if (setting.length > 80) scene.setting = setting.slice(0, 80)
    }

    const hints = Array.isArray(entry.photoHints)
      ? entry.photoHints.map(String).filter(Boolean)
      : []
    allHints.push(...hints)
    levels.push({ level, photoHints: hints.slice(0, 3) })
  }

  if (levels.length < 3) {
    throw new Error(`pack_levels_insufficient:${levels.length}:${want}`)
  }
  if (levels.length < want && levels.length >= 3) {
    // 模型少给了但仍 ≥3：接受实际数量
  } else if (levels.length > want) {
    levels.length = want
    mainWords.length = want
  }

  return {
    title,
    levels: levels.slice(0, want),
    photoHints: [...new Set(allHints)].slice(0, 8),
    mainWords: mainWords.slice(0, want),
  }
}

export type { IconColorHint }
