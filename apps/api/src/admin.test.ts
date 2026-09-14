import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createApp, type CreatedApp } from './app.js'
import { resetSmsCaptcha } from './smsCaptcha.js'
import { resetSmsIpLimiter } from './smsIpLimit.js'

const PHONE = '13800138888'
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
  init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers || {}) }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (init.token) headers.Authorization = `Bearer ${init.token}`
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

before(async () => {
  process.env.SMS_PROVIDER = 'mock'
  process.env.MOCK_SMS_CODE = '123456'
  process.env.BILLING_PROVIDER = 'manual'
  process.env.ADMIN_TOKEN = ADMIN
  delete process.env.SMS_CAPTCHA
  resetSmsIpLimiter()
  resetSmsCaptcha()
  dir = await mkdtemp(join(tmpdir(), 'admin-console-'))
  created = createApp({ databasePath: join(dir, 'membership.db') })
  server = await listen(created)
})

after(async () => {
  await server.close()
  created.close()
  resetSmsIpLimiter()
  resetSmsCaptcha()
  await rm(dir, { recursive: true, force: true })
})

test('admin JSON routes reject missing or wrong token', async () => {
  const none = await json(server.base, '/api/admin/stats')
  assert.equal(none.status, 401)
  assert.equal(none.data.error, 'unauthorized')
  assert.equal(none.data.users, undefined)

  const wrong = await json(server.base, '/api/admin/users', { token: 'wrong-token' })
  assert.equal(wrong.status, 401)
  assert.equal(wrong.data.items, undefined)

  const prev = process.env.ADMIN_TOKEN
  delete process.env.ADMIN_TOKEN
  try {
    const missing = await json(server.base, '/api/admin/stats', { token: ADMIN })
    assert.equal(missing.status, 503)
    assert.equal(missing.data.error, 'admin_not_configured')
    assert.equal(missing.data.users, undefined)
  } finally {
    process.env.ADMIN_TOKEN = prev
  }
})

test('stats and users match expected shape after mock SMS login', async () => {
  const send = await json(server.base, '/api/auth/sms/send', {
    body: { phone: PHONE },
    headers: { 'X-Forwarded-For': '203.0.113.80' },
  })
  assert.equal(send.status, 200)
  const login = await json(server.base, '/api/auth/sms/verify', {
    body: { phone: PHONE, code: '123456' },
    headers: { 'X-Forwarded-For': '203.0.113.80' },
  })
  assert.equal(login.status, 200)

  const stats = await json(server.base, '/api/admin/stats', { token: ADMIN })
  assert.equal(stats.status, 200)
  assert.equal(typeof stats.data.users, 'number')
  assert.equal(typeof stats.data.activeSessions, 'number')
  assert.equal(typeof stats.data.plusActive, 'number')
  assert.equal(typeof stats.data.ordersPaid, 'number')
  assert.ok(typeof stats.data.generatedAt === 'string')
  assert.ok(Number(stats.data.users) >= 1)
  assert.ok(Number(stats.data.activeSessions) >= 1)
  assert.ok(Number(stats.data.plusActive) >= 0)

  const users = await json(server.base, '/api/admin/users', { token: ADMIN })
  assert.equal(users.status, 200)
  const items = users.data.items as Array<Record<string, unknown>>
  assert.ok(Array.isArray(items))
  assert.ok(Number(users.data.total) >= 1)
  const found = items.find((row) => row.phone === PHONE || row.phoneMasked === '138****8888')
  assert.ok(found, 'created SMS user should appear')
  assert.equal(found?.phone, PHONE)
  assert.equal(found?.phoneMasked, '138****8888')
  assert.ok(found?.id)
  assert.ok(found?.created_at)
})

test('sessions flag expired and omit raw session token', async () => {
  const list = await json(server.base, '/api/admin/sessions', { token: ADMIN })
  assert.equal(list.status, 200)
  const items = list.data.items as Array<Record<string, unknown>>
  assert.ok(items.length >= 1)
  assert.equal(typeof items[0].expired, 'boolean')
  assert.equal(items[0].expired, false)
  assert.equal(items[0].token, undefined)
  assert.equal(items[0].token_hash, undefined)
  assert.match(String(items[0].tokenHashPrefix || ''), /^[0-9a-f]{8}$/i)
})

test('table browse allows membership tables and rejects others', async () => {
  const tables = await json(server.base, '/api/admin/tables', { token: ADMIN })
  assert.equal(tables.status, 200)
  assert.deepEqual(tables.data.tables, ['users', 'entitlements', 'orders', 'sessions', 'sms_codes'])

  const users = await json(server.base, '/api/admin/table/users', { token: ADMIN })
  assert.equal(users.status, 200)
  assert.ok(Array.isArray(users.data.columns))
  assert.ok(Array.isArray(users.data.items))
  assert.ok((users.data.columns as string[]).includes('phone'))

  const denied = await json(server.base, '/api/admin/table/schema_migrations', { token: ADMIN })
  assert.equal(denied.status, 400)
  assert.equal(denied.data.error, 'table_not_allowed')
  assert.equal(denied.data.items, undefined)

  const pending = await json(server.base, '/api/auth/sms/send', {
    body: { phone: '13600136099' },
    headers: { 'X-Forwarded-For': '203.0.113.81' },
  })
  assert.equal(pending.status, 200)
  const sms = await json(server.base, '/api/admin/table/sms_codes', { token: ADMIN })
  assert.equal(sms.status, 200)
  const smsItems = sms.data.items as Array<Record<string, unknown>>
  assert.ok(smsItems.length >= 1)
  for (const row of smsItems) {
    const hash = String(row.code_hash || '')
    assert.ok(hash.endsWith('…'), 'code_hash must be truncated')
    assert.ok(hash.length <= 16)
    assert.ok(!String(row.phone || '').includes('13600136099'))
  }
})

test('entitlements and orders list after admin plus grant', async () => {
  const grant = await json(server.base, '/api/admin/plus', {
    token: ADMIN,
    body: { phone: PHONE, plan: 'month' },
  })
  assert.equal(grant.status, 200)
  assert.equal(grant.data.plus, true)

  const stats = await json(server.base, '/api/admin/stats', { token: ADMIN })
  assert.ok(Number(stats.data.plusActive) >= 1)
  assert.ok(Number(stats.data.ordersPaid) >= 1)

  const ents = await json(server.base, '/api/admin/entitlements', { token: ADMIN })
  assert.equal(ents.status, 200)
  const entItems = ents.data.items as Array<Record<string, unknown>>
  assert.ok(entItems.some((row) => row.plusActive === true && row.phone === PHONE))

  const orders = await json(server.base, '/api/admin/orders', { token: ADMIN })
  assert.equal(orders.status, 200)
  const orderItems = orders.data.items as Array<Record<string, unknown>>
  assert.ok(orderItems.some((row) => row.status === 'paid' && row.plan === 'month'))
})

test('admin UI is served without a token', async () => {
  const res = await fetch(`${server.base}/api/admin/ui/`)
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /运营后台/)
  assert.match(html, /sessionStorage/)
})
