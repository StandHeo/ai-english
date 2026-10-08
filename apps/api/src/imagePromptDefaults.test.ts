import assert from 'node:assert/strict'
import test from 'node:test'
import * as apiDefaults from './imagePromptDefaults.ts'
import * as webDefaults from '../../web/src/family/imagePromptDefaults.ts'
import * as apiSlot from './slotSubject.ts'
import * as webSlot from '../../web/src/family/slotSubject.ts'
import * as apiDistract from './distractorWords.ts'
import * as webDistract from '../../web/src/family/distractorWords.ts'

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
  assert.doesNotMatch(apiDefaults.DEFAULT_ITEM_TEMPLATE, /单词闪卡|占画面约七成|干净的浅色柔和纯色背景/)
  assert.doesNotMatch(apiDefaults.DEFAULT_DISTRACTOR_TEMPLATE, /单词闪卡|占画面约七成|干净的浅色柔和纯色背景/)
  assert.doesNotMatch(apiDefaults.DEFAULT_SCENE_TEMPLATE, /竖版竖构图/)
  assert.match(apiDefaults.DEFAULT_SCENE_TEMPLATE, /方形构图/)
  assert.match(apiDefaults.DEFAULT_SAFETY_PREFIX, /文字|字母|数字/)
  assert.match(apiDefaults.DEFAULT_SAFETY_PREFIX, /暴力/)
  assert.doesNotMatch(apiDefaults.DEFAULT_NEGATIVE_PROMPT, /写实照片/)
  assert.equal(apiDefaults.IMAGE_PROMPT_CONFIG_VERSION, 2)
})

test('web and api slot keys and distractor pools stay in sync', () => {
  assert.equal(webSlot.normalizeSlotSubjectKey('a paper'), apiSlot.normalizeSlotSubjectKey('a paper'))
  assert.deepEqual([...webDistract.ABSTRACT_DISTRACTOR_KEYS], [...apiDistract.ABSTRACT_DISTRACTOR_KEYS])
  assert.deepEqual([...webDistract.KID_NOUN_POOL], [...apiDistract.KID_NOUN_POOL])
})
