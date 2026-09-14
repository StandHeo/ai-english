import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createApp, type CreatedApp } from './app.js'
import { findOrderByOutTradeNo, getEntitlement, PLAN_DAYS } from './membership.js'
import { encryptWechatResource, signWechatNotify } from './wechatPay.js'

const PHONE = '13500135000'
const API_V3_KEY = '12345678901234567890123456789012'

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

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

function signedNotify(plaintext: object) {
  const nonce = randomBytes(12).toString('hex').slice(0, 12)
  const associated = 'transaction'
  const ciphertext = encryptWechatResource({
    plaintext: JSON.stringify(plaintext),
    associatedData: associated,
    nonce,
    apiV3Key: API_V3_KEY,
  })
  const bodyObj = {
    id: 'ev-1',
    resource_type: 'encrypt-resource',
    event_type: 'TRANSACTION.SUCCESS',
    resource: {
      original_type: 'transaction',
      algorithm: 'AEAD_AES_256_GCM',
      ciphertext,
      associated_data: associated,
      nonce,
    },
  }
  const body = JSON.stringify(bodyObj)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const hdrNonce = randomBytes(8).toString('hex')
  const signature = signWechatNotify({ timestamp, nonce: hdrNonce, body, privateKeyPem: privateKey })
  return { body, timestamp, hdrNonce, signature }
}

let dir = ''
let created: CreatedApp
let server: { base: string; close: () => Promise<void> }
let token = ''

before(async () => {
  process.env.SMS_PROVIDER = 'mock'
  process.env.MOCK_SMS_CODE = '123456'
  process.env.BILLING_PROVIDER = 'wechat'
  process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY = publicKey
  process.env.WECHAT_PAY_API_V3_KEY = API_V3_KEY
  dir = await mkdtemp(join(tmpdir(), 'plus-wx-'))
  created = createApp({ databasePath: join(dir, 'membership.db') })
  server = await listen(created)
  await json(server.base, '/api/auth/sms/send', { body: { phone: PHONE } })
  const login = await json(server.base, '/api/auth/sms/verify', { body: { phone: PHONE, code: '123456' } })
  token = String(login.data.token)
})

after(async () => {
  await server.close()
  created.close()
  await rm(dir, { recursive: true, force: true })
})

test('logged-in wechat order is pending; guest rejected', async () => {
  const guest = await json(server.base, '/api/billing/orders', { body: { plan: 'month' } })
  assert.equal(guest.status, 401)
  const createdOrder = await json(server.base, '/api/billing/orders', { token, body: { plan: 'month' } })
  assert.equal(createdOrder.status, 201)
  assert.equal(createdOrder.data.status, 'pending')
  assert.equal(createdOrder.data.plan, 'month')
  const pay = createdOrder.data.pay as { provider?: string; unavailable?: boolean }
  assert.equal(pay.provider, 'wechat')
  assert.equal(pay.unavailable, true)
})

async function notifyOnce(outTradeNo: string, validSig: boolean) {
  const signed = signedNotify({
    out_trade_no: outTradeNo,
    trade_state: 'SUCCESS',
    transaction_id: 'tx-1',
  })
  return fetch(`${server.base}/api/billing/wechat/notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Wechatpay-Timestamp': signed.timestamp,
      'Wechatpay-Nonce': signed.hdrNonce,
      'Wechatpay-Signature': validSig ? signed.signature : 'aaaa',
      'Wechatpay-Serial': 'TEST',
    },
    body: signed.body,
  })
}

test('invalid wechat signature does not change entitlement', async () => {
  const order = await json(server.base, '/api/billing/orders', { token, body: { plan: 'month' } })
  const outTradeNo = String(order.data.outTradeNo)
  const res = await notifyOnce(outTradeNo, false)
  assert.equal(res.status, 401)
  const row = findOrderByOutTradeNo(created.db, outTradeNo)
  assert.equal(row?.status, 'pending')
  const me = await json(server.base, '/api/me', { token })
  assert.equal(me.data.plus, false)
})

test('valid month notify +30d and repeat is idempotent', async () => {
  const order = await json(server.base, '/api/billing/orders', { token, body: { plan: 'month' } })
  const outTradeNo = String(order.data.outTradeNo)
  const before = Date.now()
  const res = await notifyOnce(outTradeNo, true)
  assert.equal(res.status, 200)
  const body = (await res.json()) as { code: string }
  assert.equal(body.code, 'SUCCESS')
  const me = await json(server.base, '/api/me', { token })
  assert.equal(me.data.plus, true)
  const firstExp = Date.parse(String(me.data.expiresAt))
  assert.ok(firstExp - before > (PLAN_DAYS.month - 1) * 86400000)
  assert.ok(firstExp - before < (PLAN_DAYS.month + 1) * 86400000)

  const again = await notifyOnce(outTradeNo, true)
  assert.equal(again.status, 200)
  const me2 = await json(server.base, '/api/me', { token })
  const secondExp = Date.parse(String(me2.data.expiresAt))
  assert.equal(secondExp, firstExp)
  const dbOrder = findOrderByOutTradeNo(created.db, outTradeNo)
  assert.equal(dbOrder?.status, 'paid')
})

test('valid year notify +365d from remaining', async () => {
  const ent = getEntitlement(created.db, findOrderByOutTradeNo(created.db, 'x')?.user_id || '')
  const order = await json(server.base, '/api/billing/orders', { token, body: { plan: 'year' } })
  const outTradeNo = String(order.data.outTradeNo)
  const meBefore = await json(server.base, '/api/me', { token })
  const current = Date.parse(String(meBefore.data.expiresAt))
  const res = await notifyOnce(outTradeNo, true)
  assert.equal(res.status, 200)
  const me = await json(server.base, '/api/me', { token })
  const next = Date.parse(String(me.data.expiresAt))
  assert.ok(next >= current + PLAN_DAYS.year * 86400000 - 2000)
  void ent
})
