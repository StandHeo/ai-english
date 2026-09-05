/**
 * 家庭迷你 pack 生成（与 apps/web packSchema 对齐）。
 */
import { runAgnesCall } from './agnesRateLimit.js'
import { ensureIntroShowBeat, normalizeFamilyLevel, validateFamilyLevel } from './familyGenerate.js'

const PACK_SYSTEM_PROMPT = `You are a kids English oral-adventure designer for ages 4-6.
Given a Chinese (or mixed) family diary about a child's day, output ONE mini CONTENT PACK as JSON only (no markdown).
The pack is like the official "fruit forest" pack: several short levels, each focused on ONE main English noun with its own scene.

CRITICAL beat field names (do NOT invent other names):
- Every beat MUST have "type" and "npc_say" (never use "question" instead of npc_say).
- The FIRST beat of EVERY level MUST be an introduce beat with show (main word picture):
  {"type":"introduce","show":"placeholder","npc_say":"Look! park!","hint_say":"park"}
- introduce and ask beats MUST have "show":"placeholder" (picture of the word).
- ask beat example:
  {"type":"ask","show":"placeholder","npc_say":"I want a park! Say it!","expect":["park","a park"],"hint_say":"Park. Can you say park?","success_say":"Yes! Park!",
   "fallback":{"type":"picture_choice","options":[
     {"id":"park","image":"placeholder","correct":true},
     {"id":"bus","image":"placeholder","correct":false}
   ]}}
- find beat example:
  {"type":"find","npc_say":"Find the park!","hint_say":"Park!","success_say":"Yes! Park!",
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
- Exactly ONE find beat per level (the second beat): "Find the X!" with 2-3 options, ONE correct.
- After find: one or two ask beats, then end with a short introduce beat (e.g. "Into the basket!").
- ask beats MUST have expect (array), hint_say, success_say, and fallback.picture_choice with >=2 options.
- ask expect: the word plus one natural variant, e.g. ["park", "a park"].
- find beats MUST have options with >=2 items and exactly one correct:true.
- Distractor option ids: 2-3 DIFFERENT concrete kid nouns per level (bus, cake, home, tree…), NOT the main word, NOT abstract words.
- npc_say / hint_say / success_say in simple English like the official pack ("Mmm! Yummy fruit!", "Yes! Apple!").
- reward.sticker: "sticker-<mainword>".
- Use image:"placeholder" everywhere.
- Do NOT include beep_talk.
- Prefer concrete kid nouns from the diary; if the story is thin, invent plausible related nouns so the level count is met.`

export function clampPackLevelCount(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 4
  return Math.min(5, Math.max(3, Math.floor(v)))
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fence ? fence[1].trim() : trimmed
  return JSON.parse(raw)
}

export type GeneratedFamilyPackPayload = {
  pack: { title: string; theme: 'family' }
  levels: Record<string, unknown>[]
  photoHints: string[]
  mainWords: string[]
  levelCount: number
  debug?: {
    levelCount: number
    mainWords: string[]
    deepseekRequest: { model: string; userContent: string }
    deepseekResponsePreview: string
  }
}

function parsePack(content: string, date: string, levelCount: number): Omit<GeneratedFamilyPackPayload, 'debug'> {
  const want = clampPackLevelCount(levelCount)
  const parsed = extractJson(content) as {
    pack?: { title?: unknown }
    title?: unknown
    levels?: unknown
    level?: unknown
  }
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
  const levels: Record<string, unknown>[] = []
  const mainWords: string[] = []
  const allHints: string[] = []

  for (const raw of rawLevels.slice(0, want)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as { level?: unknown; photoHints?: unknown }
    let level = (entry.level || raw) as Record<string, unknown>
    level = normalizeFamilyLevel(level)
    ensureIntroShowBeat(level)
    const err = validateFamilyLevel(level)
    if (err) throw new Error(`invalid_level:${err}`)

    const words = Array.isArray(level.target_words) ? level.target_words.map(String) : []
    const main =
      (words[0] || 'day')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 16) || 'day'
    mainWords.push(main)

    if (typeof level.id !== 'string' || !String(level.id).startsWith('family-')) {
      level.id = `family-${idDate}-${main}`
    }
    level.approved = true
    level.theme = 'family'
    delete level.beep_talk
    level.target_words = [String(words[0] || main)]

    const scene = level.scene as Record<string, unknown>
    if (scene && typeof scene.setting === 'string' && scene.setting.trim().length > 80) {
      scene.setting = scene.setting.trim().slice(0, 80)
    }

    const hints = Array.isArray(entry.photoHints)
      ? entry.photoHints.map(String).filter(Boolean)
      : []
    allHints.push(...hints)
    levels.push(level)
  }

  if (levels.length < 3) {
    throw new Error(`pack_levels_insufficient:${levels.length}:${want}`)
  }

  return {
    pack: { title, theme: 'family' },
    levels: levels.slice(0, want),
    photoHints: [...new Set(allHints)].slice(0, 8),
    mainWords: mainWords.slice(0, want),
    levelCount: Math.min(levels.length, want),
  }
}

function mockPack(story: string, date: string, levelCount: number): GeneratedFamilyPackPayload {
  const n = clampPackLevelCount(levelCount)
  const words = ['park', 'slide', 'ball', 'bus', 'home'].slice(0, n)
  const idDate = date.replace(/-/g, '')
  const levels = words.map((word) => ({
    id: `family-${idDate}-${word}`,
    approved: true,
    theme: 'family',
    title: `${word[0]!.toUpperCase()}${word.slice(1)} Day`,
    target_words: [word],
    scene: {
      setting: `A sunny ${word} place`,
      image: 'placeholder',
      character: 'bunny',
    },
    beats: [
      { type: 'introduce', show: 'placeholder', npc_say: `Look, a ${word}!`, hint_say: word },
      {
        type: 'find',
        npc_say: `Find the ${word}!`,
        hint_say: word,
        success_say: `Yes! ${word}!`,
        options: [
          { id: word, image: 'placeholder', correct: true },
          { id: 'cake', image: 'placeholder', correct: false },
        ],
      },
      {
        type: 'ask',
        show: 'placeholder',
        npc_say: `I want a ${word}! Say it!`,
        expect: [word, `a ${word}`],
        hint_say: `${word}. Can you say ${word}?`,
        success_say: `Yes! ${word}!`,
        fallback: {
          type: 'picture_choice',
          options: [
            { id: word, image: 'placeholder', correct: true },
            { id: 'bus', image: 'placeholder', correct: false },
          ],
        },
      },
      { type: 'introduce', show: 'placeholder', npc_say: 'Great day!' },
    ],
    reward: { sticker: `sticker-${word}`, stickerImage: 'placeholder', stars: 1 },
  }))
  return {
    pack: { title: story.slice(0, 24) || 'My Day', theme: 'family' },
    levels,
    photoHints: ['今天', '好玩'],
    mainWords: words,
    levelCount: n,
    debug: {
      levelCount: n,
      mainWords: words,
      deepseekRequest: { model: 'mock', userContent: story.slice(0, 200) },
      deepseekResponsePreview: JSON.stringify(levels).slice(0, 1500),
    },
  }
}

async function callChat(input: {
  url: string
  apiKey: string
  model: string
  userContent: string
}): Promise<string> {
  const res = await fetch(input.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: PACK_SYSTEM_PROMPT },
        { role: 'user', content: input.userContent },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`llm_http_${res.status}:${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('llm_empty')
  return content
}

function resolveLlm(raw?: string): 'deepseek' | 'agnes' | 'mock' {
  const env = (process.env.FAMILY_LLM_PROVIDER || 'deepseek').trim().toLowerCase()
  const v = (raw || env).trim().toLowerCase()
  if (v === 'mock' || v === 'agnes' || v === 'deepseek') return v
  return env === 'mock' || env === 'agnes' ? env : 'deepseek'
}

export async function generateFamilyPack(input: {
  story: string
  date: string
  apiKey?: string
  levelCount?: number
  /** 兼容旧字段名 */
  minKeywords?: number
  llm?: string
}): Promise<GeneratedFamilyPackPayload> {
  const story = input.story.trim()
  if (!story) throw new Error('story_required')
  const date = input.date || new Date().toISOString().slice(0, 10)
  const levelCount = clampPackLevelCount(input.levelCount ?? input.minKeywords ?? 4)
  const llm = resolveLlm(input.llm)

  if (llm === 'mock') {
    const payload = mockPack(story, date, levelCount)
    for (const L of payload.levels) {
      const err = validateFamilyLevel(L)
      if (err) throw new Error(`mock_invalid:${err}`)
    }
    return payload
  }

  const cfg =
    llm === 'agnes'
      ? {
          url: 'https://apihub.agnes-ai.com/v1/chat/completions',
          model: process.env.AGNES_LLM_MODEL?.trim() || 'agnes-2.5-flash',
          envKeys: ['AGNES_API_KEY', 'FAMILY_LLM_API_KEY'],
        }
      : {
          url: 'https://api.deepseek.com/chat/completions',
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          envKeys: ['DEEPSEEK_API_KEY', 'FAMILY_LLM_API_KEY'],
        }

  const apiKey =
    input.apiKey?.trim() ||
    cfg.envKeys.map((k) => process.env[k]?.trim()).find(Boolean) ||
    ''
  if (!apiKey) throw new Error('api_key_required')

  const userContent = `Date: ${date}
Number of levels in the mini pack: ${levelCount}
(Each level = one main English word + its own short scene.setting, like fruit-01-apple / fruit-02-banana.)

Child day story:
${story}

Return JSON only with exactly ${levelCount} levels.`

  const attempt = async () => {
    const call = () =>
      callChat({ url: cfg.url, apiKey, model: cfg.model, userContent })
    const content = llm === 'agnes' ? await runAgnesCall(call) : await call()
    const parsed = parsePack(content, date, levelCount)
    return {
      ...parsed,
      debug: {
        levelCount: parsed.levelCount,
        mainWords: parsed.mainWords,
        deepseekRequest: { model: cfg.model, userContent },
        deepseekResponsePreview: content.slice(0, 2500),
      },
    }
  }

  try {
    return await attempt()
  } catch (first) {
    const msg = first instanceof Error ? first.message : ''
    if (msg === 'api_key_required' || msg === 'story_required') throw first
    if (
      msg.startsWith('pack_levels_insufficient:') ||
      msg.startsWith('invalid_level') ||
      msg.startsWith('llm_http_') ||
      msg.includes('TimeoutError') ||
      msg.includes('aborted') ||
      msg.includes('timeout')
    ) {
      try {
        return await attempt()
      } catch (second) {
        const s = second instanceof Error ? second : first
        if (s instanceof Error && (s.name === 'TimeoutError' || /timeout|aborted/i.test(s.message))) {
          throw new Error('llm_timeout')
        }
        throw s instanceof Error ? s : first
      }
    }
    throw first instanceof Error ? first : new Error('generate_failed')
  }
}
