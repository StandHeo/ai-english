import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { createApp, type CreatedApp } from './app.ts'
import { defaultImagePromptConfig } from './imagePromptDefaults.ts'

const ADMIN = 'test-admin-token'

async function listen(created: CreatedApp): Promise<{ base: string; close: () => Promise<void> }> {
  const server = created.app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve())
    server.once('error', reject)
  })
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

async function json(
  base: string,
  path: string,
  init: { method?: string; token?: string; adminToken?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  if (init.adminToken) headers['x-admin-token'] = init.adminToken
  const res = await fetch(`${base}${path}`, {
    method: init.method || (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, data }
}

let dir = ''
let created: CreatedApp
let server: { base: string; close: () => Promise<void> }

describe('family image prompt config routes', { concurrency: 1 }, () => {
before(async () => {
  process.env.ADMIN_TOKEN = ADMIN
  dir = await mkdtemp(join(tmpdir(), 'image-prompt-config-'))
  created = createApp({ databasePath: join(dir, 'membership.db') })
  server = await listen(created)
})

after(async () => {
  await server.close()
  created.close()
  await rm(dir, { recursive: true, force: true })
})

function savedBody(patch: Record<string, string> = {}) {
  const base = defaultImagePromptConfig()
  return {
    safetyPrefix: base.safetyPrefix,
    sceneTemplate: base.sceneTemplate,
    itemTemplate: base.itemTemplate,
    distractorTemplate: base.distractorTemplate,
    negativePrompt: base.negativePrompt,
    ...patch,
  }
}

test('GET image prompt config is public and returns baked defaults', async () => {
  const res = await json(server.base, '/api/family/image-prompt-config')
  assert.equal(res.status, 200)
  const baked = defaultImagePromptConfig()
  assert.equal(res.data.version, baked.version)
  assert.equal(res.data.safetyPrefix, baked.safetyPrefix)
  assert.equal(res.data.sceneTemplate, baked.sceneTemplate)
  assert.equal(res.data.itemTemplate, baked.itemTemplate)
  assert.equal(res.data.distractorTemplate, baked.distractorTemplate)
  assert.equal(res.data.negativePrompt, baked.negativePrompt)
  assert.equal(res.data.updatedAt, undefined)
  assert.match(String(res.data.sceneTemplate), /\{subject\}/)
  assert.match(String(res.data.sceneTemplate), /竖/)
  assert.doesNotMatch(String(res.data.sceneTemplate), /正方形/)
  assert.doesNotMatch(String(res.data.negativePrompt), /兔子/)
  assert.match(String(res.data.negativePrompt), /文字/)
  assert.match(String(res.data.negativePrompt), /暴力/)
})

test('PUT requires admin token and then GET returns the saved config', async () => {
  const missing = await json(server.base, '/api/admin/family/image-prompt-config', {
    method: 'PUT',
    body: savedBody({ sceneTemplate: '竖版自定义主题：{subject}' }),
  })
  assert.equal(missing.status, 401)

  const wrong = await json(server.base, '/api/admin/family/image-prompt-config', {
    method: 'PUT',
    token: 'nope',
    body: savedBody({ sceneTemplate: '竖版自定义主题：{subject}' }),
  })
  assert.equal(wrong.status, 401)

  const put = await json(server.base, '/api/admin/family/image-prompt-config', {
    method: 'PUT',
    token: ADMIN,
    body: savedBody({
      sceneTemplate: '竖版自定义主题：{subject}',
      negativePrompt: '文字,字母,暴力,恐怖',
    }),
  })
  assert.equal(put.status, 200)
  assert.equal(put.data.version, 2)
  assert.equal(put.data.sceneTemplate, '竖版自定义主题：{subject}')
  assert.equal(put.data.negativePrompt, '文字,字母,暴力,恐怖')
  assert.equal(typeof put.data.updatedAt, 'string')

  const got = await json(server.base, '/api/family/image-prompt-config')
  assert.equal(got.status, 200)
  assert.equal(got.data.version, 2)
  assert.equal(got.data.sceneTemplate, '竖版自定义主题：{subject}')
  assert.equal(got.data.updatedAt, put.data.updatedAt)

  const again = await json(server.base, '/api/admin/family/image-prompt-config', {
    method: 'PUT',
    adminToken: ADMIN,
    body: savedBody({
      sceneTemplate: '竖版自定义主题：{subject}',
      itemTemplate: '只画{subject}一张闪卡',
      negativePrompt: '文字,字母,暴力,恐怖',
    }),
  })
  assert.equal(again.status, 200)
  assert.equal(again.data.version, 3)
  assert.equal(again.data.itemTemplate, '只画{subject}一张闪卡')
  assert.equal(again.data.sceneTemplate, '竖版自定义主题：{subject}')
})

test('PUT rejects empty templates and templates without {subject}', async () => {
  const empty = await json(server.base, '/api/admin/family/image-prompt-config', {
    method: 'PUT',
    token: ADMIN,
    body: savedBody({ itemTemplate: '   ' }),
  })
  assert.equal(empty.status, 400)
  assert.equal(empty.data.error, 'item_template_required')

  const missingSubject = await json(server.base, '/api/admin/family/image-prompt-config', {
    method: 'PUT',
    token: ADMIN,
    body: savedBody({ distractorTemplate: '不要画成别的东西' }),
  })
  assert.equal(missingSubject.status, 400)
  assert.equal(missingSubject.data.error, 'distractor_template_missing_subject')

  const still = await json(server.base, '/api/family/image-prompt-config')
  assert.equal(still.data.version, 3)
  assert.equal(still.data.sceneTemplate, '竖版自定义主题：{subject}')
})
})
