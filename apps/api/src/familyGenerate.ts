export type GeneratedFamilyPayload = {
  level: Record<string, unknown>
  photoHints: string[]
  /** DeepSeek 建议的每词图标配色（温馨儿童向） */
  iconColors: IconColorHint[]
  debug?: {
    minKeywords: number
    keywordCount: number
    keywords: string[]
    deepseekRequest: { model: string; userContent: string }
    deepseekResponsePreview: string
  }
}

export type IconColorHint = {
  word: string
  /** 图标主色 #RRGGBB */
  fg: string
  /** 卡片浅底 #RRGGBB */
  bg: string
}

const SYSTEM_PROMPT = `You are a kids English oral-adventure level designer for ages 4-6.
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
  // 与配图张数一致：3–12
  return Math.min(12, Math.max(3, Math.floor(v)))
}

/** 从关卡收集去重英文关键词（target_words + 选项 id） */
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

/** 清洗并规范化 iconColors；非法项丢弃 */
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

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fence ? fence[1].trim() : trimmed
  return JSON.parse(raw)
}

function mockFromStory(story: string, date: string): GeneratedFamilyPayload {
  const idDate = date.replace(/-/g, '')
  const words = [
    'park',
    'slide',
    'friend',
    'ball',
    'bus',
    'home',
    'tree',
    'duck',
    'cake',
  ]
  const word = words[0]
  return {
    photoHints: ['公园', '滑梯', '朋友', '回家'],
    iconColors: words.slice(0, 6).map((w, i) => {
      const defaults = [
        { fg: '#3D9B6E', bg: '#E8F6EE' },
        { fg: '#E06B8A', bg: '#FFE8F0' },
        { fg: '#E07A3D', bg: '#FFF3E0' },
        { fg: '#5B8FD9', bg: '#E8F2FF' },
        { fg: '#D4A017', bg: '#FFF8E1' },
        { fg: '#9B6BC9', bg: '#F3E8FF' },
      ]
      return { word: w, ...defaults[i % defaults.length] }
    }),
    level: {
      id: `family-${idDate}-${word}`,
      approved: true,
      theme: 'family',
      title: 'My Day',
      target_words: words,
      scene: { setting: story.slice(0, 80) || 'A family day', image: 'placeholder', character: 'bunny' },
      beats: [
        {
          type: 'introduce',
          show: 'placeholder',
          npc_say: 'What a day!',
          hint_say: 'Day!',
        },
        {
          type: 'find',
          npc_say: 'Find the park!',
          hint_say: 'Park!',
          success_say: 'Yes!',
          options: [
            { id: 'park', image: 'placeholder', correct: true },
            { id: 'slide', image: 'placeholder', correct: false },
            { id: 'tree', image: 'placeholder', correct: false },
          ],
        },
        {
          type: 'find',
          npc_say: 'Find the ball!',
          hint_say: 'Ball!',
          success_say: 'Yes!',
          options: [
            { id: 'ball', image: 'placeholder', correct: true },
            { id: 'duck', image: 'placeholder', correct: false },
            { id: 'cake', image: 'placeholder', correct: false },
          ],
        },
        {
          type: 'ask',
          show: 'placeholder',
          npc_say: 'Where did we go?',
          expect: ['park', 'a park'],
          hint_say: 'Park!',
          success_say: 'Fun!',
          fallback: {
            type: 'picture_choice',
            options: [
              { id: 'park', image: 'placeholder', correct: true },
              { id: 'bus', image: 'placeholder', correct: false },
            ],
          },
        },
        {
          type: 'ask',
          show: 'placeholder',
          npc_say: 'Who did you see?',
          expect: ['friend', 'a friend'],
          hint_say: 'Friend!',
          success_say: 'Nice!',
          fallback: {
            type: 'picture_choice',
            options: [
              { id: 'friend', image: 'placeholder', correct: true },
              { id: 'home', image: 'placeholder', correct: false },
            ],
          },
        },
        {
          type: 'introduce',
          show: 'placeholder',
          npc_say: 'Great day!',
        },
      ],
      reward: { sticker: `sticker-family-${idDate}`, stickerImage: 'placeholder', stars: 1 },
    },
  }
}

async function callDeepseek(
  story: string,
  date: string,
  apiKey: string,
  model: string,
  minKeywords: number,
): Promise<{ content: string; userContent: string }> {
  const userContent = `Date: ${date}
Minimum UNIQUE English keywords required: ${minKeywords}
(This number is also the target image/slot count for family diary art.)
(Count = unique short nouns from target_words + every picture option id. Must be >= ${minKeywords}.)

Child day story:
${story}

If the story is thin, still invent plausible related kid nouns from a typical day so the keyword count is met.
Return JSON only.`

  const requestBody = {
    model,
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  }

  console.log(
    '[deepseek] request',
    JSON.stringify({
      model,
      minKeywords,
      userContent,
      systemPreview: SYSTEM_PROMPT.slice(0, 400),
    }),
  )

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const body = await res.text()
    console.log('[deepseek] http_error', res.status, body.slice(0, 500))
    throw new Error(`deepseek_http_${res.status}:${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('deepseek_empty')
  console.log(
    '[deepseek] response',
    JSON.stringify({
      chars: content.length,
      preview: content.slice(0, 2000),
    }),
  )
  return { content, userContent }
}

export async function generateFamilyLevel(input: {
  story: string
  date: string
  apiKey?: string
  minKeywords?: number
}): Promise<GeneratedFamilyPayload & { keywords: string[] }> {
  const story = input.story.trim()
  if (!story) throw new Error('story_required')
  const date = input.date || new Date().toISOString().slice(0, 10)
  const minKeywords = clampMinKeywords(input.minKeywords ?? 9)

  const provider = process.env.FAMILY_LLM_PROVIDER || 'deepseek'
  if (provider === 'mock') {
    const payload = mockFromStory(story, date)
    const err = validateFamilyLevel(payload.level)
    if (err) throw new Error(`mock_invalid:${err}`)
    const keywords = collectLevelKeywords(payload.level)
    if (keywords.length < minKeywords) {
      throw new Error(`keywords_insufficient:${keywords.length}:${minKeywords}`)
    }
    return {
      ...payload,
      keywords,
      debug: {
        minKeywords,
        keywordCount: keywords.length,
        keywords,
        deepseekRequest: {
          model: 'mock',
          userContent: `mock story=${story.slice(0, 200)} minKeywords=${minKeywords}`,
        },
        deepseekResponsePreview: JSON.stringify(payload.level).slice(0, 1500),
      },
    }
  }

  const apiKey =
    input.apiKey?.trim() ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.FAMILY_LLM_API_KEY ||
    ''
  if (!apiKey) throw new Error('api_key_required')

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  const attempt = async () => {
    const { content, userContent } = await callDeepseek(
      story,
      date,
      apiKey,
      model,
      minKeywords,
    )
    const parsed = extractJson(content) as {
      level?: unknown
      photoHints?: unknown
      iconColors?: unknown
    }
    const level = parsed.level || parsed
    const err = validateFamilyLevel(level)
    if (err) throw new Error(`invalid_level:${err}`)
    const hints = Array.isArray(parsed.photoHints)
      ? parsed.photoHints.map(String).filter(Boolean)
      : ['今天', '好玩']
    const L = level as Record<string, unknown>
    if (typeof L.id !== 'string' || !String(L.id).startsWith('family-')) {
      L.id = `family-${date.replace(/-/g, '')}-day`
    }
    L.approved = true
    L.theme = 'family'
    delete L.beep_talk
    const keywords = collectLevelKeywords(L)
    console.log(
      '[deepseek] keywords',
      JSON.stringify({ count: keywords.length, minKeywords, keywords }),
    )
    if (keywords.length < minKeywords) {
      throw new Error(`keywords_insufficient:${keywords.length}:${minKeywords}`)
    }
    let iconColors = normalizeIconColors(parsed.iconColors)
    if (!iconColors.length && Array.isArray(L.target_words)) {
      const defaults = [
        { fg: '#E07A3D', bg: '#FFF3E0' },
        { fg: '#3D9B6E', bg: '#E8F6EE' },
        { fg: '#5B8FD9', bg: '#E8F2FF' },
      ]
      iconColors = L.target_words.slice(0, minKeywords).map((w, i) => ({
        word: String(w).toLowerCase(),
        fg: defaults[i % defaults.length].fg,
        bg: defaults[i % defaults.length].bg,
      }))
    }
    return {
      level: L,
      photoHints: hints.slice(0, 5),
      iconColors,
      keywords,
      debug: {
        minKeywords,
        keywordCount: keywords.length,
        keywords,
        deepseekRequest: { model, userContent },
        deepseekResponsePreview: content.slice(0, 2500),
      },
    }
  }

  try {
    return await attempt()
  } catch (first) {
    const msg = first instanceof Error ? first.message : ''
    if (msg === 'api_key_required' || msg === 'story_required') throw first
    // 超时 / 关键词不足 / 偶发无效：只再试 1 次，避免拖垮手机端
    if (
      msg.startsWith('keywords_insufficient:') ||
      msg.startsWith('invalid_level') ||
      msg.startsWith('deepseek_http_') ||
      msg.includes('TimeoutError') ||
      msg.includes('aborted') ||
      msg.includes('timeout')
    ) {
      try {
        return await attempt()
      } catch (second) {
        const s = second instanceof Error ? second : first
        if (s instanceof Error && (s.name === 'TimeoutError' || /timeout|aborted/i.test(s.message))) {
          throw new Error('deepseek_timeout')
        }
        throw s instanceof Error ? s : first
      }
    }
    throw first instanceof Error ? first : new Error('generate_failed')
  }
}
