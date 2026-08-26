import test from 'node:test'
import assert from 'node:assert/strict'
import { materializeLevelForPlay, type FamilyDayRecord } from './store.ts'
import type { LevelScript } from '../types'

const baseLevel: LevelScript = {
  id: 'family-20260826-park',
  approved: true,
  theme: 'family',
  title: 'Park Day',
  target_words: ['park', 'slide', 'duck'],
  scene: { setting: '小区游乐场', image: 'placeholder', character: 'bunny' },
  beats: [
    { type: 'introduce', npc_say: 'Look!' },
    {
      type: 'ask',
      npc_say: 'Say slide',
      expect: ['slide'],
      hint_say: 'Slide',
      success_say: 'Yes',
      show: 'placeholder',
      fallback: {
        type: 'picture_choice',
        options: [
          { id: 'slide', image: 'placeholder', correct: true },
          { id: 'duck', image: 'placeholder', correct: false },
        ],
      },
    },
    {
      type: 'find',
      npc_say: 'Find the duck',
      options: [
        { id: 'duck', image: 'placeholder', correct: true },
        { id: 'park', image: 'placeholder', correct: false },
      ],
    },
  ],
  reward: { sticker: 's', stickerImage: 'placeholder', stars: 1 },
}

test('materialize maps background to images[0] and options by id', () => {
  const day: FamilyDayRecord = {
    date: '2026-08-26',
    story: '去了游乐场',
    messages: [],
    level: baseLevel,
    photoHints: [],
    iconColors: [],
    images: ['bg-scene', 'img-park', 'img-slide', 'img-duck'],
    completed: false,
    updatedAt: Date.now(),
  }
  const level = materializeLevelForPlay(day)
  assert.equal(level.scene.image, 'bg-scene')
  const ask = level.beats[1]
  const askOpts = ask.fallback?.options || []
  const slide = askOpts.find((o) => o.id === 'slide')
  const duckWrong = askOpts.find((o) => o.id === 'duck')
  assert.equal(slide?.image, 'img-slide')
  assert.equal(duckWrong?.image, 'img-duck')
  assert.notEqual(slide?.image, 'bg-scene')

  const find = level.beats[2]
  const duck = find.options?.find((o) => o.id === 'duck')
  const park = find.options?.find((o) => o.id === 'park')
  assert.equal(duck?.image, 'img-duck')
  assert.equal(park?.image, 'img-park')
})
