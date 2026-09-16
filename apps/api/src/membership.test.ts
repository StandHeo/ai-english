import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createApp, type CreatedApp } from './app.js'
import { listTableColumns, listTableNames } from './db.js'
import { PLAN_DAYS } from './membership.js'
import { resetSmsCaptcha } from './smsCaptcha.js'
import { resetSmsIpLimiter } from './smsIpLimit.js'
import { setTencentCloudFetch } from './tencentCloud.js'

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
  delete process.env.SMS_CAPTCHA
  resetSmsIpLimiter()
  resetSmsCaptcha()
  dir = await mkdtemp(join(tmpdir(), 'plus-mem-'))
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

test('schema has membership tables, WAL, and no llm key columns', () => {
  const names = listTableNames(created.db)
  for (const table of ['users', 'entitlements', 'orders', 'auth_codes', 'sessions']) {
    assert.ok(names.includes(table), table)
  }
  assert.equal(names.includes('sms_codes'), false)
  assert.ok(listTableColumns(created.db, 'users').includes('email'))
  assert.ok(listTableColumns(created.db, 'users').includes('phone'))
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
  assert.equal(me.data.phone, '138****8000')
  assert.equal(me.data.email, null)

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

function captchaAnswerFromImage(image: unknown): string {
  const value = String(image || '')
  const prefix = 'data:image/svg+xml;base64,'
  assert.ok(value.startsWith(prefix), 'captcha image should be svg data url')
  const svg = Buffer.from(value.slice(prefix.length), 'base64').toString('utf8')
  const digits = [...svg.matchAll(/>(\d)</g)].map((m) => m[1]).join('')
  assert.equal(digits.length, 4, `expected 4 captcha digits, got ${digits}`)
  return digits
}

test('sms ip rate limit is distinct from per-phone limit', async () => {
  const prevMax = process.env.SMS_IP_LIMIT_MAX
  const prevDaily = process.env.SMS_IP_DAILY_MAX
  process.env.SMS_IP_LIMIT_MAX = '2'
  delete process.env.SMS_IP_DAILY_MAX
  resetSmsIpLimiter()
  try {
    const headers = { 'X-Forwarded-For': '203.0.113.50' }
    const a = await json(server.base, '/api/auth/sms/send', { body: { phone: '13500000001' }, headers })
    const b = await json(server.base, '/api/auth/sms/send', { body: { phone: '13500000002' }, headers })
    const c = await json(server.base, '/api/auth/sms/send', { body: { phone: '13500000003' }, headers })
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.equal(c.status, 429)
    assert.equal(c.data.error, 'sms_ip_rate_limited')

    const phoneHeaders = { 'X-Forwarded-For': '203.0.113.51' }
    const first = await json(server.base, '/api/auth/sms/send', { body: { phone: '13500000010' }, headers: phoneHeaders })
    const second = await json(server.base, '/api/auth/sms/send', { body: { phone: '13500000010' }, headers: phoneHeaders })
    assert.equal(first.status, 200)
    assert.equal(second.status, 429)
    assert.equal(second.data.error, 'sms_rate_limited')
  } finally {
    if (prevMax === undefined) delete process.env.SMS_IP_LIMIT_MAX
    else process.env.SMS_IP_LIMIT_MAX = prevMax
    if (prevDaily === undefined) delete process.env.SMS_IP_DAILY_MAX
    else process.env.SMS_IP_DAILY_MAX = prevDaily
    resetSmsIpLimiter()
  }
})

test('sms ip daily cap and verify ip limit', async () => {
  const prevDaily = process.env.SMS_IP_DAILY_MAX
  const prevSend = process.env.SMS_IP_LIMIT_MAX
  const prevVerify = process.env.SMS_VERIFY_IP_LIMIT_MAX
  process.env.SMS_IP_DAILY_MAX = '2'
  process.env.SMS_IP_LIMIT_MAX = '100'
  process.env.SMS_VERIFY_IP_LIMIT_MAX = '2'
  resetSmsIpLimiter()
  try {
    const sendHeaders = { 'X-Real-IP': '203.0.113.60' }
    const s1 = await json(server.base, '/api/auth/sms/send', { body: { phone: '13500000021' }, headers: sendHeaders })
    const s2 = await json(server.base, '/api/auth/sms/send', { body: { phone: '13500000022' }, headers: sendHeaders })
    const s3 = await json(server.base, '/api/auth/sms/send', { body: { phone: '13500000023' }, headers: sendHeaders })
    assert.equal(s1.status, 200)
    assert.equal(s2.status, 200)
    assert.equal(s3.status, 429)
    assert.equal(s3.data.error, 'sms_ip_rate_limited')

    const verifyHeaders = { 'X-Forwarded-For': '203.0.113.61' }
    const v1 = await json(server.base, '/api/auth/sms/verify', {
      body: { phone: '13500000030', code: '000000' },
      headers: verifyHeaders,
    })
    const v2 = await json(server.base, '/api/auth/sms/verify', {
      body: { phone: '13500000030', code: '000000' },
      headers: verifyHeaders,
    })
    const v3 = await json(server.base, '/api/auth/sms/verify', {
      body: { phone: '13500000030', code: '000000' },
      headers: verifyHeaders,
    })
    assert.equal(v1.status, 401)
    assert.equal(v2.status, 401)
    assert.equal(v3.status, 429)
    assert.equal(v3.data.error, 'sms_ip_rate_limited')
  } finally {
    if (prevDaily === undefined) delete process.env.SMS_IP_DAILY_MAX
    else process.env.SMS_IP_DAILY_MAX = prevDaily
    if (prevSend === undefined) delete process.env.SMS_IP_LIMIT_MAX
    else process.env.SMS_IP_LIMIT_MAX = prevSend
    if (prevVerify === undefined) delete process.env.SMS_VERIFY_IP_LIMIT_MAX
    else process.env.SMS_VERIFY_IP_LIMIT_MAX = prevVerify
    resetSmsIpLimiter()
  }
})

test('sms captcha off by default and required when on', async () => {
  const prev = process.env.SMS_CAPTCHA
  const headers = { 'X-Forwarded-For': '203.0.113.70' }
  try {
    const cfgOff = await json(server.base, '/api/auth/sms/config')
    assert.equal(cfgOff.status, 200)
    assert.equal(cfgOff.data.captcha, false)
    assert.equal(cfgOff.data.authChannel, 'email')
    const cfgAlias = await json(server.base, '/api/auth/config')
    assert.equal(cfgAlias.data.authChannel, 'email')
    assert.equal(cfgAlias.data.captcha, false)
    const missing = await json(server.base, '/api/auth/captcha')
    assert.equal(missing.status, 404)
    assert.equal(missing.data.error, 'captcha_disabled')

    process.env.SMS_CAPTCHA = 'on'
    const cfgOn = await json(server.base, '/api/auth/sms/config')
    assert.equal(cfgOn.data.captcha, true)

    const noCaptcha = await json(server.base, '/api/auth/sms/send', { body: { phone: '13500000041' }, headers })
    assert.equal(noCaptcha.status, 400)
    assert.equal(noCaptcha.data.error, 'captcha_required')

    const challenge = await json(server.base, '/api/auth/captcha')
    assert.equal(challenge.status, 200)
    const id = String(challenge.data.id)
    const answer = captchaAnswerFromImage(challenge.data.image)
    const wrong = await json(server.base, '/api/auth/sms/send', {
      body: { phone: '13500000042', captchaId: id, captchaAnswer: '0000' },
      headers,
    })
    assert.equal(wrong.status, 400)
    assert.equal(wrong.data.error, 'captcha_invalid')

    const reused = await json(server.base, '/api/auth/sms/send', {
      body: { phone: '13500000042', captchaId: id, captchaAnswer: answer },
      headers,
    })
    assert.equal(reused.status, 400)
    assert.equal(reused.data.error, 'captcha_invalid')

    const okChallenge = await json(server.base, '/api/auth/captcha')
    const okId = String(okChallenge.data.id)
    const okAnswer = captchaAnswerFromImage(okChallenge.data.image)
    const ok = await json(server.base, '/api/auth/sms/send', {
      body: { phone: '13500000043', captchaId: okId, captchaAnswer: okAnswer },
      headers,
    })
    assert.equal(ok.status, 200)
    assert.equal(ok.data.mock, true)

    const replay = await json(server.base, '/api/auth/sms/send', {
      body: { phone: '13500000044', captchaId: okId, captchaAnswer: okAnswer },
      headers,
    })
    assert.equal(replay.status, 400)
    assert.equal(replay.data.error, 'captcha_invalid')
  } finally {
    if (prev === undefined) delete process.env.SMS_CAPTCHA
    else process.env.SMS_CAPTCHA = prev
    resetSmsCaptcha()
    resetSmsIpLimiter()
  }
})

test('mock email login, me, admin grant by email, smtp missing config', async () => {
  process.env.EMAIL_PROVIDER = 'mock'
  process.env.MOCK_EMAIL_CODE = '123456'
  const headers = { 'X-Forwarded-For': '203.0.113.90' }
  const email = 'parent@example.com'
  const send = await json(server.base, '/api/auth/email/send', { body: { email }, headers })
  assert.equal(send.status, 200)
  assert.equal(send.data.mock, true)

  const bad = await json(server.base, '/api/auth/email/verify', {
    body: { email, code: '000000' },
    headers: { 'X-Forwarded-For': '203.0.113.91' },
  })
  assert.equal(bad.status, 401)
  assert.equal(bad.data.token, undefined)

  const invalid = await json(server.base, '/api/auth/email/send', {
    body: { email: 'not-an-email' },
    headers: { 'X-Forwarded-For': '203.0.113.92' },
  })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.data.error, 'invalid_email')

  const ok = await json(server.base, '/api/auth/email/verify', {
    body: { email, code: '123456' },
    headers: { 'X-Forwarded-For': '203.0.113.93' },
  })
  assert.equal(ok.status, 200)
  const token = String(ok.data.token)
  assert.ok(token.length > 20)
  assert.equal(ok.data.email, 'p***@example.com')
  assert.equal(ok.data.phone, null)

  const me = await json(server.base, '/api/me', { token })
  assert.equal(me.status, 200)
  assert.equal(me.data.email, 'p***@example.com')
  assert.equal(me.data.phone, null)
  assert.equal(me.data.plus, false)

  const grant = await json(server.base, '/api/admin/plus', {
    body: { email, plan: 'month' },
    headers: { Authorization: 'Bearer test-admin-token' },
  })
  assert.equal(grant.status, 200)
  assert.equal(grant.data.plus, true)
  assert.equal(grant.data.email, 'p***@example.com')

  const mePlus = await json(server.base, '/api/me', { token })
  assert.equal(mePlus.data.plus, true)

  process.env.EMAIL_PROVIDER = 'smtp'
  delete process.env.SMTP_HOST
  delete process.env.SMTP_FROM
  const smtpFail = await json(server.base, '/api/auth/email/send', {
    body: { email: 'other@example.com' },
    headers: { 'X-Forwarded-For': '203.0.113.94' },
  })
  assert.equal(smtpFail.status, 503)
  assert.equal(smtpFail.data.error, 'email_smtp_not_configured')
  process.env.EMAIL_PROVIDER = 'mock'
})

test('tencent_ses send uses SendEmail template API; missing config is 503', async () => {
  process.env.EMAIL_PROVIDER = 'tencent_ses'
  process.env.TENCENT_SES_SECRET_ID = 'AKIDtest'
  process.env.TENCENT_SES_SECRET_KEY = 'ses-secret'
  process.env.TENCENT_SES_FROM = 'noreply@mail.tudoudou-ai.site'
  process.env.TENCENT_SES_TEMPLATE_ID = '100091'
  process.env.TENCENT_SES_REGION = 'ap-guangzhou'

  let capturedUrl = ''
  let capturedAction = ''
  let capturedVersion = ''
  let capturedBody: {
    FromEmailAddress?: string
    Destination?: string[]
    Template?: { TemplateID?: number; TemplateData?: string }
    Simple?: unknown
  } = {}
  setTencentCloudFetch(async (input, init) => {
    capturedUrl = String(input)
    const headers = init?.headers as Record<string, string>
    capturedAction = headers['X-TC-Action'] || ''
    capturedVersion = headers['X-TC-Version'] || ''
    capturedBody = JSON.parse(String(init?.body || '{}')) as typeof capturedBody
    return new Response(JSON.stringify({ Response: { MessageId: 'mid-1', RequestId: 'req-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  const email = 'ses-parent@example.com'
  try {
    const send = await json(server.base, '/api/auth/email/send', {
      body: { email },
      headers: { 'X-Forwarded-For': '203.0.113.110' },
    })
    assert.equal(send.status, 200)
    assert.equal(send.data.mock, false)
    assert.equal(capturedUrl, 'https://ses.tencentcloudapi.com/')
    assert.equal(capturedAction, 'SendEmail')
    assert.equal(capturedVersion, '2020-10-02')
    assert.equal(capturedBody.FromEmailAddress, 'noreply@mail.tudoudou-ai.site')
    assert.deepEqual(capturedBody.Destination, [email])
    assert.equal(capturedBody.Template?.TemplateID, 100091)
    assert.equal(capturedBody.Simple, undefined)
    const sentCode = String(JSON.parse(capturedBody.Template?.TemplateData || '{}').code || '')
    assert.match(sentCode, /^\d{4,8}$/)

    const verify = await json(server.base, '/api/auth/email/verify', {
      body: { email, code: sentCode },
      headers: { 'X-Forwarded-For': '203.0.113.111' },
    })
    assert.equal(verify.status, 200)
    assert.ok(String(verify.data.token).length > 20)

    delete process.env.TENCENT_SES_TEMPLATE_ID
    const missing = await json(server.base, '/api/auth/email/send', {
      body: { email: 'ses-other@example.com' },
      headers: { 'X-Forwarded-For': '203.0.113.112' },
    })
    assert.equal(missing.status, 503)
    assert.equal(missing.data.error, 'email_ses_not_configured')
  } finally {
    setTencentCloudFetch(undefined)
    process.env.EMAIL_PROVIDER = 'mock'
    delete process.env.TENCENT_SES_SECRET_ID
    delete process.env.TENCENT_SES_SECRET_KEY
    delete process.env.TENCENT_SES_FROM
    delete process.env.TENCENT_SES_TEMPLATE_ID
    delete process.env.TENCENT_SES_REGION
  }
})

test('email ip rate limit and per-address interval; AUTH_CAPTCHA gates email send', async () => {
  const prevMax = process.env.SMS_IP_LIMIT_MAX
  const prevAuth = process.env.AUTH_CAPTCHA
  const prevSms = process.env.SMS_CAPTCHA
  process.env.SMS_IP_LIMIT_MAX = '2'
  delete process.env.SMS_CAPTCHA
  delete process.env.AUTH_CAPTCHA
  resetSmsIpLimiter()
  resetSmsCaptcha()
  try {
    const headers = { 'X-Forwarded-For': '203.0.113.100' }
    const a = await json(server.base, '/api/auth/email/send', { body: { email: 'a1@example.com' }, headers })
    const b = await json(server.base, '/api/auth/email/send', { body: { email: 'a2@example.com' }, headers })
    const c = await json(server.base, '/api/auth/email/send', { body: { email: 'a3@example.com' }, headers })
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.equal(c.status, 429)
    assert.equal(c.data.error, 'auth_ip_rate_limited')

    process.env.SMS_IP_LIMIT_MAX = '100'
    resetSmsIpLimiter()
    const addrHeaders = { 'X-Forwarded-For': '203.0.113.101' }
    const first = await json(server.base, '/api/auth/email/send', {
      body: { email: 'repeat@example.com' },
      headers: addrHeaders,
    })
    const second = await json(server.base, '/api/auth/email/send', {
      body: { email: 'repeat@example.com' },
      headers: addrHeaders,
    })
    assert.equal(first.status, 200)
    assert.equal(second.status, 429)
    assert.equal(second.data.error, 'email_rate_limited')

    process.env.AUTH_CAPTCHA = 'on'
    const capHeaders = { 'X-Forwarded-For': '203.0.113.102' }
    const noCaptcha = await json(server.base, '/api/auth/email/send', {
      body: { email: 'cap@example.com' },
      headers: capHeaders,
    })
    assert.equal(noCaptcha.status, 400)
    assert.equal(noCaptcha.data.error, 'captcha_required')

    const challenge = await json(server.base, '/api/auth/captcha')
    const id = String(challenge.data.id)
    const answer = captchaAnswerFromImage(challenge.data.image)
    const ok = await json(server.base, '/api/auth/email/send', {
      body: { email: 'cap@example.com', captchaId: id, captchaAnswer: answer },
      headers: capHeaders,
    })
    assert.equal(ok.status, 200)
  } finally {
    if (prevMax === undefined) delete process.env.SMS_IP_LIMIT_MAX
    else process.env.SMS_IP_LIMIT_MAX = prevMax
    if (prevAuth === undefined) delete process.env.AUTH_CAPTCHA
    else process.env.AUTH_CAPTCHA = prevAuth
    if (prevSms === undefined) delete process.env.SMS_CAPTCHA
    else process.env.SMS_CAPTCHA = prevSms
    resetSmsCaptcha()
    resetSmsIpLimiter()
  }
})

test('email login does not merge with phone-only user', async () => {
  const phone = '13600136999'
  await json(server.base, '/api/auth/sms/send', {
    body: { phone },
    headers: { 'X-Forwarded-For': '203.0.113.110' },
  })
  const smsLogin = await json(server.base, '/api/auth/sms/verify', {
    body: { phone, code: '123456' },
    headers: { 'X-Forwarded-For': '203.0.113.110' },
  })
  assert.equal(smsLogin.status, 200)
  await json(server.base, '/api/admin/plus', {
    body: { phone, plan: 'year' },
    headers: { Authorization: 'Bearer test-admin-token' },
  })

  const email = 'unrelated@example.com'
  await json(server.base, '/api/auth/email/send', {
    body: { email },
    headers: { 'X-Forwarded-For': '203.0.113.111' },
  })
  const emailLogin = await json(server.base, '/api/auth/email/verify', {
    body: { email, code: '123456' },
    headers: { 'X-Forwarded-For': '203.0.113.111' },
  })
  assert.equal(emailLogin.status, 200)
  assert.equal(emailLogin.data.plus, false)
  assert.equal(emailLogin.data.phone, null)
})
