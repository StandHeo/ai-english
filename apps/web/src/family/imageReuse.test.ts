import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createImageReuseCache,
  fillLevelSlotImages,
  planSlotImageFills,
} from './imageReuse.ts'
import type { ImageSlot } from './imageSlots.ts'

test('planSlotImageFills reuses item images across levels but not scenes', () => {
  const cache = createImageReuseCache()
  cache.set('cake', 'img-cake')
  const level2: ImageSlot[] = [
    { word: 'A honey bar', subject: 'A honey bar', role: 'scene' },
    { word: 'shake', subject: 'shake', role: 'item' },
    { word: 'cake', subject: 'a pink frosted cake', role: 'item' },
  ]
  const plan = planSlotImageFills(level2, [], cache)
  assert.equal(plan.images[2], 'img-cake')
  assert.equal(plan.fetchSlots.some((s) => s.role === 'scene'), true)
  assert.equal(
    plan.fetchSlots.some((s) => s.word === 'cake'),
    false,
  )
  assert.equal(
    plan.fetchSlots.some((s) => s.word === 'shake'),
    true,
  )
})

test('fillLevelSlotImages fetches each scene and reuses cake by word not draw', async () => {
  const cache = createImageReuseCache()
  const calls: string[] = []
  const fetchSlots = async (slots: ImageSlot[]) => {
    return slots.map((s) => {
      calls.push(`${s.role}:${s.word || s.subject}`)
      return `gen:${s.word || s.subject}`
    })
  }

  const level1: ImageSlot[] = [
    { word: 'bakery', subject: 'bakery', role: 'scene' },
    { word: 'cake', subject: 'a pink frosted cake', role: 'item' },
  ]
  const imgs1 = await fillLevelSlotImages(level1, [], cache, fetchSlots)
  assert.equal(imgs1[0], 'gen:bakery')
  assert.equal(imgs1[1], 'gen:cake')

  const level2: ImageSlot[] = [
    { word: 'bedroom', subject: 'bedroom', role: 'scene' },
    { word: 'pillow', subject: 'pillow', role: 'item' },
    { word: 'a cake', subject: 'a chocolate cake slice', role: 'item' },
  ]
  const imgs2 = await fillLevelSlotImages(level2, [], cache, fetchSlots)
  assert.equal(imgs2[0], 'gen:bedroom')
  assert.equal(imgs2[1], 'gen:pillow')
  assert.equal(imgs2[2], 'gen:cake')
  assert.ok(calls.includes('scene:bakery'))
  assert.ok(calls.includes('item:cake'))
  assert.ok(calls.includes('scene:bedroom'))
  assert.ok(calls.includes('item:pillow'))
  assert.equal(calls.filter((c) => c === 'item:cake').length, 1)
  assert.equal(calls.some((c) => c.includes('chocolate')), false)
})
