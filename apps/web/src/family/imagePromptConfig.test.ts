import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { defaultImagePromptConfig } from './imagePromptDefaults.ts'
import {
  hydrateImagePromptConfigFromStorage,
  refreshImagePromptConfig,
  resetImagePromptConfigForTests,
} from './imagePromptConfig.ts'
import { buildKidsPrompt, getActiveImagePromptConfig } from './imageSlots.ts'

const mem = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v))
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  },
})

const custom = {
  ...defaultImagePromptConfig(),
  version: 3,
  safetyPrefix: '绘本，',
  sceneTemplate: '竖版主题：{subject}',
  itemTemplate: '闪卡：{subject}',
  distractorTemplate: '闪卡：{subject}，不要像{targetWord}',
  negativePrompt: '文字,暴力',
  updatedAt: '2026-09-23T00:00:00.000Z',
}

beforeEach(() => {
  mem.clear()
  resetImagePromptConfigForTests()
})

test('fetch failure without cache uses baked defaults', async () => {
  const cfg = await refreshImagePromptConfig(async () => ({ ok: false, data: null }))
  assert.equal(cfg.version, 1)
  assert.match(buildKidsPrompt({ subject: 'park', role: 'scene' }), /竖版竖构图/)
  assert.doesNotMatch(cfg.negativePrompt, /兔子/)
})

test('successful fetch is cached and applied', async () => {
  const cfg = await refreshImagePromptConfig(async () => ({ ok: true, data: custom }))
  assert.equal(cfg.version, 3)
  assert.match(buildKidsPrompt({ subject: 'park', role: 'scene' }), /竖版主题：park/)
  const stored = JSON.parse(mem.get('family-image-prompt-config-v1') || '{}') as { version: number }
  assert.equal(stored.version, 3)
})

test('fetch failure keeps the last cached config', async () => {
  mem.set('family-image-prompt-config-v1', JSON.stringify(custom))
  hydrateImagePromptConfigFromStorage()
  assert.equal(getActiveImagePromptConfig().version, 3)
  const cfg = await refreshImagePromptConfig(async () => {
    throw new Error('offline')
  })
  assert.equal(cfg.version, 3)
  assert.match(buildKidsPrompt({ subject: 'kite', role: 'item' }), /闪卡：kite/)
})

test('invalid payload falls back to cache or defaults', async () => {
  const cfg = await refreshImagePromptConfig(async () => ({
    ok: true,
    data: { version: 2, sceneTemplate: 'missing subject placeholder' },
  }))
  assert.equal(cfg.version, defaultImagePromptConfig().version)
  assert.match(cfg.sceneTemplate, /\{subject\}/)
})
