import test from 'node:test'
import assert from 'node:assert/strict'
import { generateFamilyLevel, validateFamilyLevel } from './familyGenerate.ts'

test('mock generate returns valid level', async () => {
  process.env.FAMILY_LLM_PROVIDER = 'mock'
  const payload = await generateFamilyLevel({
    story: '今天去了公园玩滑梯',
    date: '2026-08-06',
  })
  assert.equal(validateFamilyLevel(payload.level), null)
  assert.ok(payload.photoHints.length >= 1)
  assert.match(String(payload.level.id), /^family-/)
})

test('validate rejects empty beats', () => {
  assert.equal(
    validateFamilyLevel({
      id: 'x',
      approved: true,
      title: 't',
      target_words: ['a'],
      scene: { setting: 's', image: 'i', character: 'bunny' },
      beats: [],
      reward: { sticker: 's' },
    }),
    'beats_count',
  )
})
