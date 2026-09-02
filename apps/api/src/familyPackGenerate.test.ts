import test from 'node:test'
import assert from 'node:assert/strict'
import { clampPackLevelCount, generateFamilyPack } from './familyPackGenerate.ts'

test('clampPackLevelCount stays within 3-5', () => {
  assert.equal(clampPackLevelCount(1), 3)
  assert.equal(clampPackLevelCount(9), 5)
  assert.equal(clampPackLevelCount(4), 4)
})

test('mock pack generate returns 3-5 valid levels', async () => {
  const prev = process.env.FAMILY_LLM_PROVIDER
  process.env.FAMILY_LLM_PROVIDER = 'mock'
  try {
    const payload = await generateFamilyPack({
      story: '今天去了公园玩滑梯',
      date: '2026-09-02',
      levelCount: 4,
      llm: 'mock',
    })
    assert.equal(payload.levelCount, 4)
    assert.equal(payload.levels.length, 4)
    assert.ok(payload.pack.title)
    assert.equal(payload.mainWords.length, 4)
  } finally {
    process.env.FAMILY_LLM_PROVIDER = prev
  }
})
