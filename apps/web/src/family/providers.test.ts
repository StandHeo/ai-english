import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FAMILY_LLM,
  DEFAULT_IMAGE_CLOUD,
  familyLlmLabel,
  imageCloudLabel,
  isFamilyLlmProvider,
  isImageCloudProvider,
  nativeFamilyCloudReady,
} from './providers.ts'

test('defaults stay DeepSeek and Tongyi', () => {
  assert.equal(DEFAULT_FAMILY_LLM, 'deepseek')
  assert.equal(DEFAULT_IMAGE_CLOUD, 'tongyi')
})

test('provider labels', () => {
  assert.equal(familyLlmLabel('agnes'), 'Agnes 2.5-flash')
  assert.equal(familyLlmLabel('deepseek'), 'DeepSeek')
  assert.equal(imageCloudLabel('agnes'), 'Agnes 图')
  assert.equal(imageCloudLabel('tongyi'), '通义万相')
})

test('provider guards', () => {
  assert.equal(isFamilyLlmProvider('agnes'), true)
  assert.equal(isFamilyLlmProvider('openai'), false)
  assert.equal(isImageCloudProvider('tongyi'), true)
  assert.equal(isImageCloudProvider('mock'), false)
})

test('native with key does not need LAN API', () => {
  assert.equal(nativeFamilyCloudReady(true, ''), true)
  assert.equal(nativeFamilyCloudReady(true, 'http://192.168.1.2:8787'), true)
})

test('native without key needs LAN API', () => {
  assert.equal(nativeFamilyCloudReady(false, ''), false)
  assert.equal(nativeFamilyCloudReady(false, 'http://192.168.1.2:8787'), true)
})
