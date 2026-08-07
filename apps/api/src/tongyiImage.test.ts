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

test('slotsFromLevel picks scene + words capped', () => {
  process.env.TONGYI_IMAGE_MAX = '4'
  const slots = slotsFromLevel({
    target_words: ['park', 'slide', 'ball', 'tree', 'extra'],
    scene: { setting: '公园滑梯' },
    beats: [
      {
        type: 'find',
        options: [{ id: 'slide' }, { id: 'duck' }],
      },
    ],
  })
  assert.equal(slots[0]?.role, 'scene')
  assert.ok(slots.length <= 4)
  assert.ok(slots.some((s) => s.subject === 'park' || s.subject.includes('公园')))
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
