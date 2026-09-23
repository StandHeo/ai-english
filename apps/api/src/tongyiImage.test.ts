import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { defaultImagePromptConfig } from './imagePromptDefaults.ts'
import {
  buildKidsPrompt,
  bufferToJpegDataUrl,
  compressImageBuffer,
  generateFamilyImages,
  slotsFromLevel,
} from './tongyiImage.ts'

test('buildKidsPrompt includes safety prefix for items', () => {
  const p = buildKidsPrompt({ subject: 'slide', role: 'item' })
  assert.match(p, /儿童绘本/)
  assert.match(p, /slide/)
  assert.match(p, /居中/)
  assert.match(p, /七成/)
  assert.match(p, /闪卡/)
  assert.doesNotMatch(p, /正方形|兔子/)
})

test('buildKidsPrompt scene asks for a tall background', () => {
  const p = buildKidsPrompt({ subject: '小区游乐场', role: 'scene' })
  assert.match(p, /儿童绘本/)
  assert.match(p, /竖/)
  assert.match(p, /环境/)
  assert.match(p, /小区游乐场/)
  assert.doesNotMatch(p, /正方形/)
})

test('distractor prompt names the target word and omits it when empty', () => {
  const avoid = buildKidsPrompt(
    { subject: 'fork', role: 'item', distractor: true, targetWord: 'chopsticks' },
  )
  assert.match(avoid, /fork/)
  assert.match(avoid, /不要画成或看起来像chopsticks/)
  const plain = buildKidsPrompt({ subject: 'fork', role: 'item', distractor: true, targetWord: '' })
  assert.doesNotMatch(plain, /\{targetWord\}|不要画成|看起来像/)
})

test('slotsFromLevel uses scene.setting as first scene slot', () => {
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
  assert.equal(slots[0]?.subject, '公园滑梯')
  assert.equal(slots[1]?.role, 'item')
  assert.equal(slots[1]?.subject, 'park')
  assert.equal(slots.length, 5)
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
  assert.ok(out.length < 550_000)
  assert.ok(out.length < big.length)
  const meta = await sharp(out).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.ok((meta.width || 0) <= 768)
  assert.ok((meta.height || 0) <= 768)
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

test('mock generate-images applies prompt config to scene, item, and distractor', async () => {
  const custom = {
    ...defaultImagePromptConfig(),
    sceneTemplate: '竖版背景主题：{subject}',
    itemTemplate: '闪卡主体：{subject}',
    distractorTemplate: '闪卡主体：{subject}，不要像{targetWord}',
    negativePrompt: '文字,暴力',
  }
  assert.doesNotMatch(custom.negativePrompt, /兔子|bunny/i)
  const result = await generateFamilyImages({
    date: '2026-08-07',
    forceMock: true,
    slots: [
      { subject: 'park', role: 'scene' },
      { subject: 'slide', role: 'item' },
      { subject: 'kite', role: 'item' },
    ],
    promptConfig: custom,
  })
  assert.equal(result.images.length, 3)
  assert.match(result.debug?.calls[0]?.prompt || '', /竖版背景主题：park/)
  assert.match(result.debug?.calls[1]?.prompt || '', /闪卡主体：slide/)
  assert.doesNotMatch(result.debug?.calls[1]?.prompt || '', /不要像/)
  assert.match(result.debug?.calls[2]?.prompt || '', /不要像slide/)
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

test('agnes image without key throws image_provider_unavailable', async () => {
  const prev = process.env.FAMILY_IMAGE_PROVIDER
  delete process.env.AGNES_API_KEY
  delete process.env.DASHSCOPE_API_KEY
  delete process.env.TONGYI_API_KEY
  try {
    await assert.rejects(
      () =>
        generateFamilyImages({
          date: '2026-08-18',
          slots: [{ subject: 'park', role: 'scene' }],
          imageProvider: 'agnes',
        }),
      /image_provider_unavailable/,
    )
  } finally {
    process.env.FAMILY_IMAGE_PROVIDER = prev
  }
})
