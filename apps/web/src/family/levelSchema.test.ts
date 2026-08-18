import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectLevelKeywords,
  parseValidatedFamilyLevel,
  validateFamilyLevel,
} from './levelSchema.ts'

const validLevel = {
  id: 'family-20260818-park',
  approved: true,
  title: 'Park Day',
  target_words: ['park', 'slide', 'ball', 'tree'],
  scene: { setting: 'park', image: 'placeholder', character: 'bunny' },
  beats: [
    { type: 'introduce', npc_say: 'Look, a park!' },
    {
      type: 'ask',
      npc_say: 'Say park!',
      expect: ['park'],
      hint_say: 'Park',
      success_say: 'Yes!',
      fallback: {
        type: 'picture_choice',
        options: [
          { id: 'park', image: 'placeholder', correct: true },
          { id: 'bus', image: 'placeholder', correct: false },
        ],
      },
    },
    {
      type: 'find',
      npc_say: 'Find the duck',
      options: [
        { id: 'duck', image: 'placeholder', correct: true },
        { id: 'cake', image: 'placeholder', correct: false },
        { id: 'home', image: 'placeholder', correct: false },
      ],
    },
  ],
  reward: { sticker: 'sticker-park', stickerImage: 'placeholder', stars: 1 },
}

test('validate accepts a playable family level', () => {
  assert.equal(validateFamilyLevel(validLevel), null)
})

test('collectLevelKeywords is unique across words and options', () => {
  const words = collectLevelKeywords(validLevel)
  for (const w of ['park', 'slide', 'ball', 'tree', 'bus', 'duck', 'cake', 'home']) {
    assert.ok(words.includes(w), w)
  }
})

test('parseValidatedFamilyLevel rejects thin keyword sets', () => {
  assert.throws(
    () => parseValidatedFamilyLevel(JSON.stringify({ level: validLevel }), '2026-08-18', 20),
    /keywords_insufficient/,
  )
})

test('parseValidatedFamilyLevel accepts enough keywords', () => {
  const parsed = parseValidatedFamilyLevel(
    JSON.stringify({ level: validLevel, photoHints: ['公园'] }),
    '2026-08-18',
    3,
  )
  assert.equal(parsed.level.title, 'Park Day')
  assert.ok(parsed.keywords.length >= 3)
  assert.deepEqual(parsed.photoHints, ['公园'])
})
