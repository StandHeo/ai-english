import test from 'node:test'
import assert from 'node:assert/strict'
import { buildKidsPrompt, clampImageSlots, slotsFromLevel } from './imageSlots.ts'

test('clampImageSlots stays within 3-12', () => {
  assert.equal(clampImageSlots(undefined), 9)
  assert.equal(clampImageSlots(1), 3)
  assert.equal(clampImageSlots(20), 12)
})

test('buildKidsPrompt keeps kids safety prefix', () => {
  const p = buildKidsPrompt({ subject: 'slide', role: 'item' })
  assert.match(p, /儿童绘本/)
  assert.match(p, /slide/)
})

test('slotsFromLevel prefers English words and respects max', () => {
  const slots = slotsFromLevel(
    {
      target_words: ['park', 'slide', 'ball', 'tree', 'duck', 'bench'],
      beats: [{ type: 'find', options: [{ id: 'slide' }, { id: 'kite' }] }],
    },
    5,
  )
  assert.equal(slots[0]?.role, 'scene')
  assert.equal(slots[0]?.subject, 'park')
  assert.equal(slots.length, 5)
})
