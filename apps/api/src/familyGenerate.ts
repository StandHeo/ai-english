export type GeneratedFamilyPayload = {
  level: Record<string, unknown>
  photoHints: string[]
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
    "target_words": [1-3 short English words kids can say],
    "scene": { "setting": string, "image": "placeholder", "character": "bunny" },
    "beats": [3-6 items],
    "reward": { "sticker": string, "stickerImage": "placeholder", "stars": 1 }
  },
  "photoHints": [2-5 short Chinese or English phrases for searching the phone photo album]
}
Beat types: "introduce" | "ask" | "find".
Each beat needs "type" and "npc_say" (simple English, max ~8 words).
ask beats MUST have "expect" (array of short phrases), "hint_say", "success_say", and "fallback": { "type":"picture_choice", "options":[ {id, image:"placeholder", correct:true}, {id, image:"placeholder", correct:false} ] }.
find beats MUST have "options" with at least 2 items and one correct.
Prefer words like park, slide, rice, friend, ball, bus, home — avoid long phrases.
Use image:"placeholder" everywhere; photos are attached later.`

export function validateFamilyLevel(level: unknown): string | null {
  if (!level || typeof level !== 'object') return 'level_not_object'
  const L = level as Record<string, unknown>
  if (typeof L.id !== 'string' || !L.id) return 'missing_id'
  if (L.approved !== true && L.approved !== false) return 'missing_approved'
  if (typeof L.title !== 'string') return 'missing_title'
  if (!Array.isArray(L.target_words) || L.target_words.length < 1) return 'target_words'
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
  const words = ['park', 'friend', 'home']
  const word = words[0]
  return {
    photoHints: ['公园', '朋友', '回家'],
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
            { id: 'home', image: 'placeholder', correct: false },
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
              { id: 'friend', image: 'placeholder', correct: false },
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
): Promise<string> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Date: ${date}\nChild day story:\n${story}\n\nReturn JSON only.`,
        },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`deepseek_http_${res.status}:${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('deepseek_empty')
  return content
}

export async function generateFamilyLevel(input: {
  story: string
  date: string
  apiKey?: string
}): Promise<GeneratedFamilyPayload> {
  const story = input.story.trim()
  if (!story) throw new Error('story_required')
  const date = input.date || new Date().toISOString().slice(0, 10)

  const provider = process.env.FAMILY_LLM_PROVIDER || 'deepseek'
  if (provider === 'mock') {
    const payload = mockFromStory(story, date)
    const err = validateFamilyLevel(payload.level)
    if (err) throw new Error(`mock_invalid:${err}`)
    return payload
  }

  const apiKey =
    input.apiKey?.trim() ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.FAMILY_LLM_API_KEY ||
    ''
  if (!apiKey) throw new Error('api_key_required')

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  const attempt = async () => {
    const content = await callDeepseek(story, date, apiKey, model)
    const parsed = extractJson(content) as {
      level?: unknown
      photoHints?: unknown
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
    return { level: L, photoHints: hints.slice(0, 5) }
  }

  try {
    return await attempt()
  } catch (first) {
    try {
      return await attempt()
    } catch {
      throw first instanceof Error ? first : new Error('generate_failed')
    }
  }
}
