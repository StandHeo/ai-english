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

    // 每关对齐官方节奏：intro(show) → find(1 个正确) → ask(expect 变体) → 收尾 intro
    const mainWords = payload.mainWords as string[]
    payload.levels.forEach((L, i) => {
      const lv = L as Record<string, unknown>
      const beats = lv.beats as Array<Record<string, unknown>>
      const word = mainWords[i]!
      assert.equal(beats[0]?.type, 'introduce')
      assert.equal(beats[0]?.show, 'placeholder')
      const finds = beats.filter((b) => b.type === 'find')
      assert.equal(finds.length, 1)
      assert.equal((finds[0]!.options as unknown[]).length, 2)
      const ask = beats.find((b) => b.type === 'ask')!
      assert.equal(ask.show, 'placeholder')
      assert.deepEqual(ask.expect, [word, `a ${word}`])
      assert.equal(beats.at(-1)?.type, 'introduce')
      assert.equal((lv.reward as Record<string, unknown>).sticker, `sticker-${word}`)
    })
  } finally {
    process.env.FAMILY_LLM_PROVIDER = prev
  }
})
