import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampPackLevelCount,
  parseValidatedFamilyPack,
} from './packSchema.ts'

const oneLevel = (word: string) => ({
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
            { id: 'bus', image: 'placeholder', correct: false },
          ],
        },
      },
      {
        type: 'find',
        npc_say: `Find ${word}`,
        options: [
          { id: word, image: 'placeholder', correct: true },
          { id: 'cake', image: 'placeholder', correct: false },
        ],
      },
    ],
    reward: { sticker: `s-${word}`, stickerImage: 'placeholder', stars: 1 },
  },
})

test('clampPackLevelCount stays within 3-5', () => {
  assert.equal(clampPackLevelCount(2), 3)
  assert.equal(clampPackLevelCount(9), 5)
  assert.equal(clampPackLevelCount(4), 4)
})

test('parseValidatedFamilyPack accepts 3 levels', () => {
  const content = JSON.stringify({
    pack: { title: 'Fun Day' },
    levels: [oneLevel('park'), oneLevel('slide'), oneLevel('ball')],
  })
  const parsed = parseValidatedFamilyPack(content, '2026-09-02', 3)
  assert.equal(parsed.title, 'Fun Day')
  assert.equal(parsed.levels.length, 3)
  assert.deepEqual(parsed.mainWords, ['park', 'slide', 'ball'])
})

test('parseValidatedFamilyPack rejects fewer than 3 levels', () => {
  const content = JSON.stringify({
    pack: { title: 'X' },
    levels: [oneLevel('park'), oneLevel('slide')],
  })
  assert.throws(
    () => parseValidatedFamilyPack(content, '2026-09-02', 4),
    /pack_levels_insufficient/,
  )
})

test('parseValidatedFamilyPack rejects invalid level shape', () => {
  const bad = {
    pack: { title: 'X' },
    levels: [
      oneLevel('park'),
      oneLevel('slide'),
      { level: { id: 'x', approved: true, title: 't', target_words: ['a'] } },
    ],
  }
  assert.throws(
    () => parseValidatedFamilyPack(JSON.stringify(bad), '2026-09-02', 3),
    /invalid_level/,
  )
})
