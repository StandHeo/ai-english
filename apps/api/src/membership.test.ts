import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createApp, type CreatedApp } from './app.js'
import { listTableColumns, listTableNames } from './db.js'
import { PLAN_DAYS } from './membership.js'

const PHONE = '13800138000'
const PHONE2 = '13900139000'

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
  process.env.ADMIN_TOKEN = 'test-admin-token'
  dir = await mkdtemp(join(tmpdir(), 'plus-mem-'))
  created = createApp({ databasePath: join(dir, 'membership.db') })
  server = await listen(created)
})

after(async () => {
  await server.close()
  created.close()
  await rm(dir, { recursive: true, force: true })
})

test('schema has membership tables, WAL, and no llm key columns', () => {
  const names = listTableNames(created.db)
  for (const table of ['users', 'entitlements', 'orders', 'sms_codes', 'sessions']) {
    assert.ok(names.includes(table), table)
  }
  const mode = created.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
  assert.equal(mode.journal_mode, 'wal')
  const forbidden = /key|llm|agnes|deepseek|tongyi|mysql/i
  for (const table of names) {
    for (const col of listTableColumns(created.db, table)) {
      assert.equal(forbidden.test(col), false, `${table}.${col}`)
    }
  }
})

test('mock sms login, me, logout, wrong code', async () => {
  const send = await json(server.base, '/api/auth/sms/send', { body: { phone: PHONE } })
  assert.equal(send.status, 200)
  assert.equal(send.data.mock, true)

  const bad = await json(server.base, '/api/auth/sms/verify', { body: { phone: PHONE, code: '000000' } })
  assert.equal(bad.status, 401)
  assert.equal(bad.data.token, undefined)

  const none = await json(server.base, '/api/me')
  assert.equal(none.status, 401)

  const ok = await json(server.base, '/api/auth/sms/verify', { body: { phone: PHONE, code: '123456' } })
  assert.equal(ok.status, 200)
  const token = String(ok.data.token)
  assert.ok(token.length > 20)
  assert.equal(ok.data.plus, false)
  assert.equal(ok.data.expiresAt, null)

  const me = await json(server.base, '/api/me', { token })
  assert.equal(me.status, 200)
  assert.equal(me.data.plus, false)
  assert.ok('expiresAt' in me.data)

  const logout = await json(server.base, '/api/auth/logout', { method: 'POST', token })
  assert.equal(logout.status, 200)
  const after = await json(server.base, '/api/me', { token })
  assert.equal(after.status, 401)
})

test('manual grant month/year and renewal from max(now, current)', async () => {
  const send = await json(server.base, '/api/auth/sms/send', { body: { phone: PHONE2 } })
  assert.equal(send.status, 200)
  const login = await json(server.base, '/api/auth/sms/verify', { body: { phone: PHONE2, code: '123456' } })
  const token = String(login.data.token)

  const denied = await json(server.base, '/api/admin/plus', {
    body: { phone: PHONE2, plan: 'month' },
    headers: { Authorization: 'Bearer wrong' },
  })
  assert.equal(denied.status, 401)

  const before = Date.now()
  const grant = await json(server.base, '/api/admin/plus', {
    body: { phone: PHONE2, plan: 'month' },
    headers: { Authorization: 'Bearer test-admin-token' },
  })
  assert.equal(grant.status, 200)
  assert.equal(grant.data.plus, true)
  const monthExp = Date.parse(String(grant.data.expiresAt))
  const monthDelta = monthExp - before
  assert.ok(monthDelta > (PLAN_DAYS.month - 1) * 86400000)
  assert.ok(monthDelta < (PLAN_DAYS.month + 1) * 86400000)

  const me = await json(server.base, '/api/me', { token })
  assert.equal(me.data.plus, true)

  const grantYear = await json(server.base, '/api/admin/plus', {
    body: { phone: PHONE2, plan: 'year' },
    headers: { 'x-admin-token': 'test-admin-token' },
  })
  assert.equal(grantYear.status, 200)
  const yearExp = Date.parse(String(grantYear.data.expiresAt))
  const expectedMin = monthExp + PLAN_DAYS.year * 86400000 - 2000
  assert.ok(yearExp >= expectedMin, `renew from remaining, got ${yearExp} vs ${expectedMin}`)

  const manualOrder = await json(server.base, '/api/billing/orders', { token, body: { plan: 'month' } })
  assert.equal(manualOrder.status, 400)
  assert.equal(manualOrder.data.error, 'billing_manual')
})

test('delete account invalidates token and does not inherit plus', async () => {
  const phone = '13700137000'
  process.env.BILLING_PROVIDER = 'manual'
  await json(server.base, '/api/auth/sms/send', { body: { phone } })
  const login = await json(server.base, '/api/auth/sms/verify', { body: { phone, code: '123456' } })
  const token = String(login.data.token)
  await json(server.base, '/api/admin/plus', {
    body: { phone, plan: 'year' },
    headers: { Authorization: 'Bearer test-admin-token' },
  })
  const del = await json(server.base, '/api/me/delete', { method: 'POST', token })
  assert.equal(del.status, 200)
  const me = await json(server.base, '/api/me', { token })
  assert.equal(me.status, 401)

  await json(server.base, '/api/auth/sms/send', { body: { phone } })
  const again = await json(server.base, '/api/auth/sms/verify', { body: { phone, code: '123456' } })
  assert.equal(again.status, 200)
  assert.equal(again.data.plus, false)
  assert.equal(again.data.expiresAt, null)
})

test('unauthenticated billing order is rejected', async () => {
  process.env.BILLING_PROVIDER = 'wechat'
  const res = await json(server.base, '/api/billing/orders', { body: { plan: 'year' } })
  assert.equal(res.status, 401)
  process.env.BILLING_PROVIDER = 'manual'
})

test('tencent sms missing config fails clearly; mock still works', async () => {
  process.env.SMS_PROVIDER = 'tencent'
  delete process.env.TENCENT_SMS_SECRET_ID
  const fail = await json(server.base, '/api/auth/sms/send', { body: { phone: '13600136000' } })
  assert.equal(fail.status, 503)
  assert.equal(fail.data.error, 'sms_tencent_not_configured')
  process.env.SMS_PROVIDER = 'mock'
  const ok = await json(server.base, '/api/auth/sms/send', { body: { phone: '13600136001' } })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.mock, true)
})

test('existing asr/match/tts/family routes still respond without plus token', async () => {
  const match = await json(server.base, '/api/match', { body: { transcript: 'apple', expect: ['apple'] } })
  assert.equal(match.status, 200)
  assert.equal(match.data.matched, true)

  const asr = await fetch(`${server.base}/api/asr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'apple', expect: 'apple' }),
  })
  assert.equal(asr.status, 200)
  const asrData = (await asr.json()) as { transcript: string; matched: boolean }
  assert.equal(asrData.transcript, 'apple')

  const tts = await json(server.base, '/api/tts', { body: { text: 'hi' } })
  assert.ok(tts.status === 200 || tts.status === 500)

  const health = await json(server.base, '/health')
  assert.equal(health.status, 200)
  assert.equal(health.data.ok, true)

  process.env.FAMILY_LLM_PROVIDER = 'mock'
  const family = await json(server.base, '/api/family/generate-level', {
    body: { story: '今天去了公园玩滑梯荡秋千还吃了冰淇淋看了小狗', date: '2026-09-14', mode: 'legacy' },
  })
  assert.equal(family.status, 200)
  assert.ok(family.data.level)
})
