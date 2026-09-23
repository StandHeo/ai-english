import assert from 'node:assert/strict'
import test from 'node:test'
import * as apiDefaults from './imagePromptDefaults.ts'
import * as webDefaults from '../../web/src/family/imagePromptDefaults.ts'

test('web and api image prompt defaults stay in sync', () => {
  assert.deepEqual(webDefaults.DEFAULT_IMAGE_PROMPT_CONFIG, apiDefaults.DEFAULT_IMAGE_PROMPT_CONFIG)
  const slots = [
    { subject: '小区游乐场', role: 'scene' as const },
    { subject: 'slide', role: 'item' as const },
    { subject: 'kite', role: 'item' as const },
  ]
  for (let i = 0; i < slots.length; i++) {
    assert.equal(webDefaults.renderPromptAt(slots, i), apiDefaults.renderPromptAt(slots, i))
  }
  const alone = { subject: 'fork', role: 'item' as const, distractor: true, targetWord: '' }
  assert.equal(webDefaults.renderKidsPrompt(alone), apiDefaults.renderKidsPrompt(alone))
  assert.doesNotMatch(apiDefaults.DEFAULT_NEGATIVE_PROMPT, /兔子|bunny/i)
  assert.match(apiDefaults.DEFAULT_SCENE_TEMPLATE, /\{subject\}/)
  assert.doesNotMatch(apiDefaults.DEFAULT_SAFETY_PREFIX, /正方形/)
  assert.doesNotMatch(apiDefaults.DEFAULT_SCENE_TEMPLATE, /正方形/)
})
