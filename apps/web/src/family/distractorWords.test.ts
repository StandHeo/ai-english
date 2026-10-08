import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isAbstractDistractorId,
  sanitizeLevelDistractors,
} from './distractorWords.ts'
import { parseValidatedFamilyPack } from './packSchema.ts'

test('isAbstractDistractorId matches paper and a paper', () => {
  assert.equal(isAbstractDistractorId('paper'), true)
  assert.equal(isAbstractDistractorId('a paper'), true)
  assert.equal(isAbstractDistractorId('square'), true)
  assert.equal(isAbstractDistractorId('bus'), false)
})

test('sanitizeLevelDistractors replaces paper option not the main word', () => {
  const level = {
    target_words: ['cake'],
    beats: [
      {
        type: 'find',
        options: [
          { id: 'cake', correct: true },
          { id: 'a paper', correct: false },
        ],
      },
    ],
  }
  const used = new Set(['cake', 'paper'])
  sanitizeLevelDistractors(level, used)
  const ids = (level.beats[0]!.options as { id: string }[]).map((o) => o.id)
  assert.equal(ids[0], 'cake')
  assert.notEqual(ids[1], 'a paper')
  assert.notEqual(ids[1], 'paper')
  assert.equal(isAbstractDistractorId(ids[1]!), false)
})

const oneLevel = (word: string, distractor: string) => ({
  level: {
    id: `family-20260902-${word}`,
    approved: true,
    title: `${word} Day`,
    target_words: [word],
    scene: { setting: `A sunny ${word} place`, image: 'placeholder', character: 'bunny' },
    beats: [
      { type: 'introduce', npc_say: `Look!` },
      {
        type: 'ask',
        npc_say: `Say ${word}`,
        expect: [word],
        hint_say: word,
        success_say: 'Yes!',
        fallback: {
          type: 'picture_choice',
          options: [
            { id: word, image: 'placeholder', correct: true },
            { id: distractor, image: 'placeholder', correct: false },
          ],
        },
      },
      {
        type: 'find',
        npc_say: `Find ${word}`,
        hint_say: word,
        success_say: 'Yes!',
        options: [
          { id: word, image: 'placeholder', correct: true },
          { id: distractor, image: 'placeholder', correct: false },
        ],
      },
    ],
    reward: { sticker: `s-${word}`, stickerImage: 'placeholder', stars: 1 },
  },
})

test('parseValidatedFamilyPack rewrites abstract distractors', () => {
  const content = JSON.stringify({
    pack: { title: 'Fun Day' },
    levels: [
      oneLevel('park', 'paper'),
      oneLevel('slide', 'a square'),
      oneLevel('ball', 'bus'),
      oneLevel('duck', 'tree'),
      oneLevel('cake', 'home'),
    ],
  })
  const parsed = parseValidatedFamilyPack(content, '2026-09-02', 5)
  const allIds: string[] = []
  for (const { level } of parsed.levels) {
    const beats = level.beats as Array<{ options?: { id: string }[]; fallback?: { options?: { id: string }[] } }>
    for (const b of beats) {
      for (const o of b.options || b.fallback?.options || []) allIds.push(o.id)
    }
  }
  assert.equal(allIds.some((id) => isAbstractDistractorId(id)), false)
})
