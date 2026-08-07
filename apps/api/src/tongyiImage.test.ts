import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildKidsPrompt,
  generateFamilyImages,
  slotsFromLevel,
} from './tongyiImage.ts'

test('buildKidsPrompt includes safety prefix', () => {
  const p = buildKidsPrompt({ subject: 'slide', role: 'item' })
  assert.match(p, /儿童绘本/)
  assert.match(p, /slide/)
})

test('slotsFromLevel prefers English words and respects maxSlots', () => {
  const slots = slotsFromLevel(
    {
      target_words: ['park', 'slide', 'ball', 'tree', 'duck', 'bench'],
      scene: { setting: '公园滑梯' },
      beats: [
        {
          type: 'find',
          options: [{ id: 'slide' }, { id: 'kite' }],
        },
      ],
    },
    5,
  )
  assert.equal(slots[0]?.role, 'scene')
  assert.equal(slots[0]?.subject, 'park')
  assert.equal(slots.length, 5)
  assert.ok(slots.every((s) => /^[a-z]/i.test(s.subject)))
})

test('mock generate-images returns data urls', async () => {
  process.env.FAMILY_IMAGE_PROVIDER = 'mock'
  const result = await generateFamilyImages({
    date: '2026-08-07',
    slots: [
      { subject: 'park', role: 'scene' },
      { subject: 'slide', role: 'item' },
    ],
    forceMock: true,
  })
  assert.equal(result.provider, 'mock')
  assert.equal(result.images.length, 2)
  assert.ok(result.images.every((u) => u.startsWith('data:image')))
})

test('tongyi mode without key throws image_provider_unavailable', async () => {
  process.env.FAMILY_IMAGE_PROVIDER = 'tongyi'
  delete process.env.DASHSCOPE_API_KEY
  delete process.env.TONGYI_API_KEY
  await assert.rejects(
    () =>
      generateFamilyImages({
        date: '2026-08-07',
        slots: [{ subject: 'park', role: 'scene' }],
      }),
    /image_provider_unavailable/,
  )
})
