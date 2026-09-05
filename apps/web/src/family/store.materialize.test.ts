import test from 'node:test'
import assert from 'node:assert/strict'
import {
  materializeLevelForPlay,
  materializeMiniLevelForPlay,
  type FamilyDayRecord,
} from './store.ts'
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

test('materialize shuffles correct answer away from a fixed position', () => {
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
  const seenOrders = new Set<string>()
  let sawNonFirstCorrect = false
  for (let i = 0; i < 40; i++) {
    const play = materializeLevelForPlay(day)
    const find = play.beats.find((b) => b.type === 'find')
    const opts = find?.options || []
    assert.equal(opts.length, 2)
    const correctIdx = opts.findIndex((o) => o.correct)
    assert.ok(correctIdx >= 0)
    if (correctIdx !== 0) sawNonFirstCorrect = true
    seenOrders.add(opts.map((o) => o.id).join(','))
  }
  assert.ok(sawNonFirstCorrect, 'correct option should sometimes not be first')
  assert.ok(seenOrders.size > 1, 'option order should vary between plays')
})

test('materialize prepends an introduce show beat when level starts with find', () => {
  const day: FamilyDayRecord = {
    date: '2026-08-27',
    story: '去了游乐场',
    messages: [],
    level: {
      ...baseLevel,
      beats: baseLevel.beats.filter((b) => b.type !== 'introduce'),
    },
    photoHints: [],
    iconColors: [],
    images: ['bg-scene', 'img-park', 'img-slide', 'img-duck'],
    completed: false,
    updatedAt: Date.now(),
  }
  const play = materializeLevelForPlay(day)
  const first = play.beats[0]
  assert.equal(first?.type, 'introduce')
  assert.ok(first?.show, 'intro beat must show a picture')
  assert.notEqual(first?.show, 'placeholder')
  assert.match(first?.npc_say || '', /park/i)
})

const miniLevel = (word: string, distractors: string[]): LevelScript => ({
  id: `family-20260827-${word}`,
  approved: true,
  theme: 'family',
  title: `${word} Day`,
  target_words: [word],
  scene: { setting: `A sunny ${word} place`, image: 'placeholder', character: 'bunny' },
  beats: [
    {
      type: 'find',
      npc_say: `Find the ${word}!`,
      hint_say: word,
      success_say: 'Yes!',
      options: [
        { id: word, image: 'placeholder', correct: true },
        ...distractors.map((d) => ({ id: d, image: 'placeholder', correct: false })),
      ],
    },
    {
      type: 'ask',
      npc_say: `Say ${word}!`,
      expect: [word],
      hint_say: word,
      success_say: 'Yes!',
      fallback: {
        type: 'picture_choice',
        options: [
          { id: word, image: 'placeholder', correct: true },
          { id: 'duck', image: 'placeholder', correct: false },
        ],
      },
    },
  ],
  reward: { sticker: `s-${word}`, stickerImage: 'placeholder', stars: 1 },
})

function miniDay(level: LevelScript): FamilyDayRecord {
  return {
    date: '2026-08-27',
    story: '去了游乐场',
    messages: [],
    level: null,
    photoHints: [],
    iconColors: [],
    images: [],
    pack: { title: 'My Day', theme: 'family', levelIds: [level.id] },
    miniLevels: [{ id: level.id, level }],
    completed: false,
    updatedAt: Date.now(),
  }
}

test('mini level play starts with a picture and shuffles find options', () => {
  const day = miniDay(miniLevel('bus', ['cake', 'tree']))
  const play = materializeMiniLevelForPlay(day, 'family-20260827-bus')

  // 第一拍必须是带大图的 introduce（先看图，孩子才知道该说什么）
  const intro = play.beats[0]!
  assert.equal(intro.type, 'introduce')
  assert.ok(intro.show, 'intro beat must show a picture')
  assert.notEqual(intro.show, 'placeholder')

  // ask 拍也要有大图提示
  const ask = play.beats.find((b) => b.type === 'ask')!
  assert.ok(ask.show && ask.show !== 'placeholder')

  // find 拍不透题：不挂 show
  const find = play.beats.find((b) => b.type === 'find')!
  assert.ok(!find.show)

  // 多次进关，正确项不会总在第一位
  const optsOf = (lv: LevelScript) =>
    (lv.beats.find((b) => b.type === 'find')?.options || []).map((o) => o.id)
  let sawNonFirstCorrect = false
  const orders = new Set<string>()
  for (let i = 0; i < 40; i++) {
    const p = materializeMiniLevelForPlay(day, 'family-20260827-bus')
    const ids = optsOf(p)
    assert.equal(ids.length, 3)
    if (ids[0] !== 'bus') sawNonFirstCorrect = true
    orders.add(ids.join(','))
  }
  assert.ok(sawNonFirstCorrect, 'correct option should sometimes not be first')
  assert.ok(orders.size > 1, 'option order should vary between plays')
})
