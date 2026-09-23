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
        hint_say: word,
        success_say: 'Yes!',
        options: [
          { id: word, image: 'placeholder', correct: true },
          { id: 'cake', image: 'placeholder', correct: false },
        ],
      },
    ],
    reward: { sticker: `s-${word}`, stickerImage: 'placeholder', stars: 1 },
  },
})

const fiveWords = ['park', 'slide', 'ball', 'duck', 'tree'] as const

test('clampPackLevelCount stays within 5-9', () => {
  assert.equal(clampPackLevelCount(2), 5)
  assert.equal(clampPackLevelCount(12), 9)
  assert.equal(clampPackLevelCount(7), 7)
  assert.equal(clampPackLevelCount(4), 5)
})

test('parseValidatedFamilyPack accepts 5 levels', () => {
  const content = JSON.stringify({
    pack: { title: 'Fun Day' },
    levels: fiveWords.map((w) => oneLevel(w)),
  })
  const parsed = parseValidatedFamilyPack(content, '2026-09-02', 5)
  assert.equal(parsed.title, 'Fun Day')
  assert.equal(parsed.levels.length, 5)
  assert.deepEqual(parsed.mainWords, [...fiveWords])
})

test('parseValidatedFamilyPack guarantees an intro show beat first', () => {
  const findFirst = (word: string) => ({
    level: {
      id: `family-20260902-${word}`,
      approved: true,
      title: `${word} Day`,
      target_words: [word],
      scene: { setting: `A sunny ${word} place`, image: 'placeholder', character: 'bunny' },
      beats: [
        {
          type: 'find',
          npc_say: `Find ${word}`,
          hint_say: word,
          success_say: 'Yes!',
          options: [
            { id: word, image: 'placeholder', correct: true },
            { id: 'cake', image: 'placeholder', correct: false },
          ],
        },
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
        { type: 'introduce', npc_say: 'Bye!' },
      ],
      reward: { sticker: `s-${word}`, stickerImage: 'placeholder', stars: 1 },
    },
  })
  const content = JSON.stringify({
    pack: { title: 'Fun' },
    levels: fiveWords.map((w) => findFirst(w)),
  })
  const parsed = parseValidatedFamilyPack(content, '2026-09-02', 5)
  assert.equal(parsed.levels.length, 5)
  for (const { level } of parsed.levels) {
    const beats = level.beats as Record<string, unknown>[]
    assert.equal(beats[0]?.type, 'introduce')
    assert.equal(beats[0]?.show, 'placeholder')
    assert.ok(beats.length <= 6)
  }
})

test('parseValidatedFamilyPack rejects fewer than 5 levels', () => {
  const content = JSON.stringify({
    pack: { title: 'X' },
    levels: [oneLevel('park'), oneLevel('slide'), oneLevel('ball')],
  })
  assert.throws(
    () => parseValidatedFamilyPack(content, '2026-09-02', 6),
    /pack_levels_insufficient/,
  )
})

test('parseValidatedFamilyPack rejects invalid level shape', () => {
  const bad = {
    pack: { title: 'X' },
    levels: [
      ...fiveWords.slice(0, 4).map((w) => oneLevel(w)),
      { level: { id: 'x', approved: true, title: 't', target_words: ['a'] } },
    ],
  }
  assert.throws(
    () => parseValidatedFamilyPack(JSON.stringify(bad), '2026-09-02', 5),
    /invalid_level/,
  )
})

test('parseValidatedFamilyPack repairs Agnes-style question/correct_id beats', () => {
  const agnesStyle = (word: string) => ({
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
          question: `Say ${word}?`,
          expect: word,
          hint_say: word,
          success_say: 'Yes!',
          fallback: {
            question: `Which is ${word}?`,
            options: [
              { id: word, label: word },
              { id: 'bus', label: 'bus' },
            ],
            correct_id: word,
          },
        },
        {
          type: 'find',
          question: `Find ${word}`,
          options: [
            { id: word, label: word },
            { id: 'cake', label: 'cake' },
          ],
          correct_id: word,
        },
      ],
      reward: { sticker: `s-${word}`, stickerImage: 'placeholder', stars: 1 },
    },
  })
  const content = JSON.stringify({
    pack: { title: 'Fun' },
    levels: fiveWords.map((w) => agnesStyle(w)),
  })
  const parsed = parseValidatedFamilyPack(content, '2026-09-02', 5)
  assert.equal(parsed.levels.length, 5)
  const ask = (parsed.levels[0]!.level.beats as Record<string, unknown>[])[1]!
  assert.equal(ask.npc_say, 'Say park?')
  assert.deepEqual(ask.expect, ['park'])
  const fb = ask.fallback as { type: string; options: { correct: boolean }[] }
  assert.equal(fb.type, 'picture_choice')
  assert.ok(fb.options.some((o) => o.correct))
})
