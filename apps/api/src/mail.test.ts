import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  emailProvider,
  emailSendPrecheckError,
  sendAuthEmail,
  tencentSesConfigured,
} from './mail.js'
import { setTencentCloudFetch } from './tencentCloud.js'

const SES_ENV = [
  'EMAIL_PROVIDER',
  'TENCENT_SES_SECRET_ID',
  'TENCENT_SES_SECRET_KEY',
  'TENCENT_CLOUD_SECRET_ID',
  'TENCENT_CLOUD_SECRET_KEY',
  'TENCENT_SES_FROM',
  'EMAIL_FROM',
  'SMTP_FROM',
  'TENCENT_SES_TEMPLATE_ID',
  'TENCENT_SES_REGION',
  'TENCENT_SES_SUBJECT',
] as const

const saved: Partial<Record<(typeof SES_ENV)[number], string | undefined>> = {}

function snapshotEnv() {
  for (const key of SES_ENV) saved[key] = process.env[key]
}

function restoreEnv() {
  for (const key of SES_ENV) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  setTencentCloudFetch(undefined)
}

snapshotEnv()
afterEach(restoreEnv)

function header(init: RequestInit | undefined, name: string): string {
  const h = init?.headers
  if (!h) return ''
  if (h instanceof Headers) return h.get(name) || ''
  const rec = h as Record<string, string>
  return rec[name] || rec[name.toLowerCase()] || ''
}

test('emailProvider maps tencent_ses aliases; unknown stays mock', () => {
  process.env.EMAIL_PROVIDER = 'tencent_ses'
  assert.equal(emailProvider(), 'tencent_ses')
  process.env.EMAIL_PROVIDER = 'tencent-ses'
  assert.equal(emailProvider(), 'tencent_ses')
  process.env.EMAIL_PROVIDER = 'ses'
  assert.equal(emailProvider(), 'tencent_ses')
  process.env.EMAIL_PROVIDER = 'smtp'
  assert.equal(emailProvider(), 'smtp')
  delete process.env.EMAIL_PROVIDER
  assert.equal(emailProvider(), 'mock')
})

test('tencentSesConfigured requires SES or shared cloud keys plus from and template id', () => {
  delete process.env.TENCENT_SES_SECRET_ID
  delete process.env.TENCENT_SES_SECRET_KEY
  delete process.env.TENCENT_CLOUD_SECRET_ID
  delete process.env.TENCENT_CLOUD_SECRET_KEY
  delete process.env.TENCENT_SES_FROM
  delete process.env.TENCENT_SES_TEMPLATE_ID
  assert.equal(tencentSesConfigured(), false)

  process.env.TENCENT_CLOUD_SECRET_ID = 'AKID'
  process.env.TENCENT_CLOUD_SECRET_KEY = 'key'
  process.env.EMAIL_FROM = 'noreply@mail.tudoudou-ai.site'
  process.env.TENCENT_SES_TEMPLATE_ID = '100091'
  assert.equal(tencentSesConfigured(), true)

  process.env.TENCENT_SES_TEMPLATE_ID = 'not-a-number'
  assert.equal(tencentSesConfigured(), false)
})

test('sendAuthEmail tencent_ses posts SendEmail template payload over mocked HTTP', async () => {
  process.env.EMAIL_PROVIDER = 'tencent_ses'
  process.env.TENCENT_SES_SECRET_ID = 'AKIDses'
  process.env.TENCENT_SES_SECRET_KEY = 'ses-secret'
  process.env.TENCENT_SES_FROM = 'noreply@mail.tudoudou-ai.site'
  process.env.TENCENT_SES_TEMPLATE_ID = '100091'
  process.env.TENCENT_SES_REGION = 'ap-guangzhou'

  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  setTencentCloudFetch(async (input, init) => {
    capturedUrl = String(input)
    capturedInit = init
    return new Response(JSON.stringify({ Response: { MessageId: 'mid-1', RequestId: 'req-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  await sendAuthEmail('parent@example.com', '654321')

  assert.equal(capturedUrl, 'https://ses.tencentcloudapi.com/')
  assert.equal(header(capturedInit, 'X-TC-Action'), 'SendEmail')
  assert.equal(header(capturedInit, 'X-TC-Version'), '2020-10-02')
  assert.equal(header(capturedInit, 'X-TC-Region'), 'ap-guangzhou')
  assert.match(header(capturedInit, 'Authorization'), /^TC3-HMAC-SHA256 /)

  const body = JSON.parse(String(capturedInit?.body || '{}')) as {
    FromEmailAddress: string
    Destination: string[]
    Subject: string
    Template: { TemplateID: number; TemplateData: string }
    Simple?: unknown
  }
  assert.equal(body.FromEmailAddress, 'noreply@mail.tudoudou-ai.site')
  assert.deepEqual(body.Destination, ['parent@example.com'])
  assert.equal(body.Subject, '土豆豆AI英语 登录验证码')
  assert.equal(body.Template.TemplateID, 100091)
  assert.equal(body.Template.TemplateData, JSON.stringify({ code: '654321' }))
  assert.equal(body.Simple, undefined)
})

test('sendAuthEmail tencent_ses maps API errors and missing config', async () => {
  process.env.EMAIL_PROVIDER = 'tencent_ses'
  delete process.env.TENCENT_SES_SECRET_ID
  delete process.env.TENCENT_CLOUD_SECRET_ID
  assert.equal(emailSendPrecheckError(), 'email_ses_not_configured')
  await assert.rejects(() => sendAuthEmail('a@b.co', '123456'), /email_ses_not_configured/)

  process.env.TENCENT_SES_SECRET_ID = 'AKID'
  process.env.TENCENT_SES_SECRET_KEY = 'secret'
  process.env.TENCENT_SES_FROM = 'noreply@mail.tudoudou-ai.site'
  process.env.TENCENT_SES_TEMPLATE_ID = '1'
  setTencentCloudFetch(async () =>
    new Response(
      JSON.stringify({
        Response: { Error: { Code: 'FailedOperation.WithOutPermission', Message: 'template only' } },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  )
  await assert.rejects(
    () => sendAuthEmail('a@b.co', '123456'),
    (err: unknown) => {
      assert.equal(err instanceof Error && err.message, 'email_ses_failed:FailedOperation.WithOutPermission')
      return true
    },
  )
})
