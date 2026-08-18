import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectLevelKeywords,
  generateFamilyLevel,
  normalizeIconColors,
  validateFamilyLevel,
} from './familyGenerate.ts'

test('mock generate returns valid level with enough keywords', async () => {
  process.env.FAMILY_LLM_PROVIDER = 'mock'
  const payload = await generateFamilyLevel({
    story: '今天去了公园玩滑梯',
    date: '2026-08-06',
    minKeywords: 9,
  })
  assert.equal(validateFamilyLevel(payload.level), null)
  assert.ok(payload.photoHints.length >= 1)
  assert.ok(payload.iconColors.length >= 1)
  assert.match(payload.iconColors[0].fg, /^#[0-9A-F]{6}$/)
  assert.ok(payload.keywords.length >= 9)
  assert.match(String(payload.level.id), /^family-/)
})

test('normalizeIconColors keeps valid hex pairs', () => {
  const list = normalizeIconColors([
    { word: 'Fish', fg: '#e07a3d', bg: '#fff3e0' },
    { word: 'bad', fg: 'red', bg: '#fff' },
  ])
  assert.equal(list.length, 1)
  assert.equal(list[0].word, 'fish')
  assert.equal(list[0].fg, '#E07A3D')
})

test('collectLevelKeywords gathers unique option ids', () => {
  const words = collectLevelKeywords({
    target_words: ['park', 'friend'],
    beats: [
      {
        type: 'find',
        options: [
          { id: 'park', correct: true },
          { id: 'bus', correct: false },
          { id: 'duck', correct: false },
        ],
      },
    ],
  })
  assert.ok(words.includes('park'))
  assert.ok(words.includes('bus'))
  assert.ok(words.includes('duck'))
  assert.ok(words.includes('friend'))
})

test('validate rejects empty beats', () => {
  assert.equal(
    validateFamilyLevel({
      id: 'x',
      approved: true,
      title: 't',
      target_words: ['a'],
      scene: { setting: 's', image: 'i', character: 'bunny' },
      beats: [],
      reward: { sticker: 's' },
    }),
    'beats_count',
  )
})

test('agnes llm without key throws api_key_required', async () => {
  const prev = process.env.FAMILY_LLM_PROVIDER
  process.env.FAMILY_LLM_PROVIDER = 'deepseek'
  delete process.env.AGNES_API_KEY
  try {
    await assert.rejects(
      () =>
        generateFamilyLevel({
          story: '今天去了公园玩滑梯',
          date: '2026-08-18',
          llm: 'agnes',
        }),
      (err: unknown) => err instanceof Error && err.message === 'api_key_required',
    )
  } finally {
    process.env.FAMILY_LLM_PROVIDER = prev
  }
})
