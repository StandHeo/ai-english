import assert from 'node:assert/strict'
import test from 'node:test'
import { OPTION_DRAW_MAX_CHARS, normalizeOptionDraw } from './optionDraw.ts'
import { normalizeFamilyLevel } from './levelSchema.ts'

test('normalizeOptionDraw trims and truncates', () => {
  assert.equal(normalizeOptionDraw('  a pink cake  '), 'a pink cake')
  assert.equal(normalizeOptionDraw(''), undefined)
  assert.equal(normalizeOptionDraw(null), undefined)
  const long = 'x'.repeat(OPTION_DRAW_MAX_CHARS + 20)
  assert.equal(normalizeOptionDraw(long)?.length, OPTION_DRAW_MAX_CHARS)
})

test('normalizeFamilyLevel keeps optional draw and main_draw', () => {
  const level = normalizeFamilyLevel({
    id: 'family-20261008-cake',
    approved: true,
    title: 'Cake',
    target_words: ['cake'],
    main_draw: '  a pink frosted cake  ',
    scene: { setting: 'bakery', image: 'placeholder', character: 'bunny' },
    beats: [
      {
        type: 'find',
        npc_say: 'Find cake!',
        options: [
          { id: 'cake', image: 'placeholder', correct: true, draw: 'a pink frosted cake on a plate' },
          { id: 'bus', image: 'placeholder', correct: false },
        ],
      },
      {
        type: 'ask',
        npc_say: 'Say cake!',
        expect: ['cake'],
        hint_say: 'cake',
        success_say: 'Yes!',
        fallback: {
          type: 'picture_choice',
          options: [
            { id: 'cake', image: 'placeholder', correct: true },
            { id: 'tree', image: 'placeholder', correct: false },
          ],
        },
      },
      { type: 'introduce', npc_say: 'Yay!', show: 'placeholder' },
    ],
    reward: { sticker: 's-cake', stickerImage: 'placeholder', stars: 1 },
  })
  assert.equal(level.main_draw, 'a pink frosted cake')
  const find = (level.beats as Array<{ type: string; options?: Array<{ id: string; draw?: string }> }>).find(
    (b) => b.type === 'find',
  )
  assert.equal(find?.options?.[0]?.draw, 'a pink frosted cake on a plate')
  assert.equal(find?.options?.[1]?.draw, undefined)
})
