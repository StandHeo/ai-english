import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {
  buildKidsPrompt,
  bufferToJpegDataUrl,
  compressImageBuffer,
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

test('compressImageBuffer shrinks large png to jpeg under limit', async () => {
  // 合成一张偏大的 PNG（1280 方图），压缩后应明显更小
  const big = await sharp({
    create: {
      width: 1280,
      height: 1280,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .png()
    .toBuffer()

  const out = await compressImageBuffer(big)
  assert.ok(out.length < 400_000)
  assert.ok(out.length < big.length)
  const meta = await sharp(out).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.ok((meta.width || 0) <= 512)
  assert.ok((meta.height || 0) <= 512)
})

test('bufferToJpegDataUrl returns jpeg data url', async () => {
  const png = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .png()
    .toBuffer()
  const url = await bufferToJpegDataUrl(png)
  assert.match(url, /^data:image\/jpeg;base64,/)
  assert.ok(url.length < 80_000)
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
