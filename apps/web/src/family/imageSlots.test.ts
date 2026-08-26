import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildKidsPrompt,
  clampImageSlots,
  firstItemImage,
  imageUrlBySubject,
  slotsFromLevel,
} from './imageSlots.ts'

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
  assert.match(scene, /全景|环境/)
  assert.match(scene, /小区游乐场/)
  assert.match(item, /居中/)
  assert.match(item, /slide/)
  assert.doesNotMatch(item, /全景/)
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
