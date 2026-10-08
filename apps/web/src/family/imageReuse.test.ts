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
    { subject: 'A honey bar', role: 'scene' },
    { subject: 'shake', role: 'item' },
    { subject: 'cake', role: 'item' },
  ]
  const plan = planSlotImageFills(level2, [], cache)
  assert.equal(plan.images[2], 'img-cake')
  assert.equal(plan.fetchSlots.some((s) => s.role === 'scene'), true)
  assert.equal(
    plan.fetchSlots.some((s) => s.subject === 'cake'),
    false,
  )
  assert.equal(
    plan.fetchSlots.some((s) => s.subject === 'shake'),
    true,
  )
})

test('fillLevelSlotImages fetches each scene and reuses cake', async () => {
  const cache = createImageReuseCache()
  const calls: string[] = []
  const fetchSlots = async (slots: ImageSlot[]) => {
    return slots.map((s) => {
      calls.push(`${s.role}:${s.subject}`)
      return `gen:${s.subject}`
    })
  }

  const level1: ImageSlot[] = [
    { subject: 'bakery', role: 'scene' },
    { subject: 'cake', role: 'item' },
  ]
  const imgs1 = await fillLevelSlotImages(level1, [], cache, fetchSlots)
  assert.equal(imgs1[0], 'gen:bakery')
  assert.equal(imgs1[1], 'gen:cake')

  const level2: ImageSlot[] = [
    { subject: 'bedroom', role: 'scene' },
    { subject: 'pillow', role: 'item' },
    { subject: 'a cake', role: 'item' },
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
  assert.equal(calls.some((c) => c.includes('a cake')), false)
})
