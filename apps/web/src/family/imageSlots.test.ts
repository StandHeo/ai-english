import test from 'node:test'
import assert from 'node:assert/strict'
import {
  annotatePromptSlots,
  buildKidsPrompt,
  clampImageSlots,
  firstItemImage,
  imageUrlBySubject,
  miniLevelMissingImageSlots,
  promptForSlotAt,
  resetActiveImagePromptConfig,
  setActiveImagePromptConfig,
  slotsForMiniLevel,
  slotsFromLevel,
} from './imageSlots.ts'
import { defaultImagePromptConfig } from './imagePromptDefaults.ts'

test('clampImageSlots stays within 3-12', () => {
  assert.equal(clampImageSlots(undefined), 9)
  assert.equal(clampImageSlots(1), 3)
  assert.equal(clampImageSlots(20), 12)
})

test('slotsFromLevel puts scene.setting first as scene', () => {
  const slots = slotsFromLevel(
    {
      target_words: ['park', 'slide', 'ball', 'tree', 'duck'],
      scene: { setting: '小区游乐场' },
      beats: [{ type: 'find', options: [{ id: 'slide' }, { id: 'kite' }] }],
    },
    5,
  )
  assert.equal(slots[0]?.role, 'scene')
  assert.equal(slots[0]?.subject, '小区游乐场')
  assert.equal(slots[1]?.role, 'item')
  assert.equal(slots[1]?.subject, 'park')
  assert.equal(slots.length, 5)
  assert.ok(slots.every((s, i) => (i === 0 ? s.role === 'scene' : s.role === 'item')))
})

test('slotsFromLevel falls back to first word when setting empty', () => {
  const slots = slotsFromLevel(
    {
      target_words: ['park', 'slide'],
      scene: { setting: '' },
      beats: [],
    },
    9,
  )
  assert.equal(slots[0]?.subject, 'park')
  assert.equal(slots[0]?.role, 'scene')
  // park already used as scene — not duplicated as item
  assert.equal(slots[1]?.subject, 'slide')
  assert.equal(slots.length, 2)
})

test('buildKidsPrompt differs for scene vs item', () => {
  const scene = buildKidsPrompt({ subject: '小区游乐场', role: 'scene' })
  const item = buildKidsPrompt({ subject: 'slide', role: 'item' })
  assert.match(scene, /竖/)
  assert.match(scene, /环境/)
  assert.match(scene, /小区游乐场/)
  assert.match(scene, /儿童绘本/)
  assert.doesNotMatch(scene, /正方形/)
  assert.match(item, /居中/)
  assert.match(item, /七成/)
  assert.match(item, /闪卡/)
  assert.match(item, /slide/)
  assert.doesNotMatch(item, /竖版/)
  assert.doesNotMatch(item, /不要画成/)
})

test('distractor prompt avoids the main word and drops the clause when target is empty', () => {
  const slots = [
    { subject: 'lunch table', role: 'scene' as const },
    { subject: 'chopsticks', role: 'item' as const },
    { subject: 'fork', role: 'item' as const },
  ]
  const scene = promptForSlotAt(slots, 0)
  const main = promptForSlotAt(slots, 1)
  const distractor = promptForSlotAt(slots, 2)
  assert.match(scene, /竖/)
  assert.doesNotMatch(scene, /正方形/)
  assert.match(main, /chopsticks/)
  assert.doesNotMatch(main, /不要画成/)
  assert.match(distractor, /fork/)
  assert.match(distractor, /chopsticks/)
  assert.match(distractor, /不要画成或看起来像/)

  const alone = buildKidsPrompt(
    { subject: 'fork', role: 'item', distractor: true, targetWord: 'chopsticks' },
  )
  assert.match(alone, /不要画成或看起来像chopsticks/)

  const omitted = buildKidsPrompt(
    { subject: 'fork', role: 'item', distractor: true, targetWord: '' },
  )
  assert.match(omitted, /fork/)
  assert.doesNotMatch(omitted, /\{targetWord\}|不要画成|看起来像/)
})

test('annotatePromptSlots marks later items as distractors of the first item', () => {
  const slots = annotatePromptSlots([
    { subject: 'park', role: 'scene' },
    { subject: 'slide', role: 'item' },
    { subject: 'kite', role: 'item' },
  ])
  assert.equal(slots[1]?.distractor, undefined)
  assert.equal(slots[2]?.distractor, true)
  assert.equal(slots[2]?.targetWord, 'slide')
  assert.match(buildKidsPrompt(slots[2]!), /不要画成或看起来像slide/)
})

test('active prompt config overrides baked templates', () => {
  const custom = {
    ...defaultImagePromptConfig(),
    version: 4,
    sceneTemplate: '竖版封面主题：{subject}',
    itemTemplate: '闪卡只画{subject}',
    distractorTemplate: '闪卡只画{subject}，不要像{targetWord}',
    negativePrompt: '文字,暴力',
  }
  setActiveImagePromptConfig(custom)
  try {
    assert.match(buildKidsPrompt({ subject: 'park', role: 'scene' }), /竖版封面主题：park/)
    assert.match(buildKidsPrompt({ subject: 'slide', role: 'item' }), /闪卡只画slide/)
    assert.doesNotMatch(custom.negativePrompt, /兔子/)
  } finally {
    resetActiveImagePromptConfig()
  }
})

test('imageUrlBySubject maps option id to item slot', () => {
  const slots = slotsFromLevel(
    {
      target_words: ['park', 'slide'],
      scene: { setting: '公园' },
      beats: [],
    },
    9,
  )
  const images = ['bg', 'park-img', 'slide-img']
  assert.equal(imageUrlBySubject(slots, images, 'slide'), 'slide-img')
  assert.equal(imageUrlBySubject(slots, images, '公园'), 'bg')
  assert.equal(firstItemImage(slots, images), 'park-img')
})

test('slotsForMiniLevel includes distractor option ids like fork', () => {
  const slots = slotsForMiniLevel(
    {
      target_words: ['chopsticks'],
      scene: { setting: 'lunch table' },
      beats: [
        {
          type: 'ask',
          fallback: {
            type: 'picture_choice',
            options: [
              { id: 'chopsticks', correct: true },
              { id: 'fork', correct: false },
            ],
          },
        },
      ],
    },
    'A cozy dining table at lunchtime',
    4,
  )
  assert.equal(slots[0]?.role, 'scene')
  assert.equal(slots[0]?.subject, 'A cozy dining table at lunchtime')
  assert.deepEqual(
    slots.filter((s) => s.role === 'item').map((s) => s.subject),
    ['chopsticks', 'fork'],
  )
})

test('slotsForMiniLevel defaults to 1 scene + 4 item slots', () => {
  const slots = slotsForMiniLevel(
    {
      target_words: ['park'],
      scene: { setting: 'A sunny park' },
      beats: [
        {
          type: 'find',
          npc_say: 'Find the park!',
          options: [
            { id: 'park', correct: true },
            { id: 'bus', correct: false },
            { id: 'tree', correct: false },
          ],
        },
        {
          type: 'ask',
          npc_say: 'Say park!',
          expect: ['park'],
          fallback: {
            type: 'picture_choice',
            options: [
              { id: 'park', correct: true },
              { id: 'kite', correct: false },
            ],
          },
        },
      ],
    },
    'A sunny park',
  )
  assert.equal(slots.length, 5)
  assert.equal(slots[0]?.role, 'scene')
  // 主词 + 全部干扰项都有独立道具槽，不再有文字占位图
  assert.deepEqual(
    slots.filter((s) => s.role === 'item').map((s) => s.subject),
    ['park', 'bus', 'tree', 'kite'],
  )
})

test('miniLevelMissingImageSlots detects missing distractor art', () => {
  const level = {
    target_words: ['chopsticks'],
    scene: { setting: 'table' },
    beats: [
      {
        fallback: {
          options: [{ id: 'chopsticks' }, { id: 'fork' }],
        },
      },
    ],
  }
  const missing = miniLevelMissingImageSlots(level, 'table', 'bg-url', ['chopsticks-url'])
  assert.equal(missing.length, 1)
  assert.equal(missing[0]?.subject, 'fork')
})
