import test from 'node:test'
import assert from 'node:assert/strict'
import { sceneNeedsTranslation } from './imageSlots.ts'

test('sceneNeedsTranslation detects CJK text', () => {
  assert.equal(sceneNeedsTranslation('阳光下的游泳池'), true)
  assert.equal(sceneNeedsTranslation('小区游乐场，有滑梯'), true)
  assert.equal(sceneNeedsTranslation('公園'), true) // 繁体
  assert.equal(sceneNeedsTranslation('공원'), true) // 韩文
  assert.equal(sceneNeedsTranslation('公園 with tree'), true) // 混合
})

test('sceneNeedsTranslation passes English through', () => {
  assert.equal(sceneNeedsTranslation('A sunny outdoor swimming pool'), false)
  assert.equal(sceneNeedsTranslation('playground'), false)
  assert.equal(sceneNeedsTranslation(''), false)
  assert.equal(sceneNeedsTranslation('12345'), false)
})
