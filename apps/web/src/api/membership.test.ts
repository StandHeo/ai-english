import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { parentEmailSendMessage, isMembershipConnectFailure } from './membership.ts'

const pages = join(dirname(fileURLToPath(import.meta.url)), '..', 'pages')
const membershipSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'membership.ts'), 'utf8')
const parentSrc = readFileSync(join(pages, 'ParentPage.tsx'), 'utf8')

const CHILD_FILES = [
  'HomePage.tsx',
  'MapPage.tsx',
  'LevelPage.tsx',
  'FamilyCalendarPage.tsx',
  'FamilyLevelPage.tsx',
  'FamilyDayPackPage.tsx',
  'StickersPage.tsx',
]

describe('child path has no login or prices', () => {
  it('does not mention login, SMS, or Plus prices', () => {
    const ban = /开通会员|验证码|¥18|¥148|包月|包年|登录|Plus/
    for (const file of CHILD_FILES) {
      const src = readFileSync(join(pages, file), 'utf8')
      assert.equal(ban.test(src), false, file)
    }
  })
})

describe('parent plus copy', () => {
  it('states Plus excludes third-party model fees', () => {
    assert.match(parentSrc, /不含第三方模型调用费/)
    assert.match(parentSrc, /发送验证码/)
    assert.match(parentSrc, /注销账号/)
  })

  it('keeps suggested starter prices as fen', () => {
    assert.match(membershipSrc, /priceFen: 1800/)
    assert.match(membershipSrc, /priceFen: 14800/)
    assert.match(membershipSrc, /¥\$\{/)
  })

  it('can fetch auth captcha config for parent login', () => {
    assert.match(membershipSrc, /\/api\/auth\/config/)
    assert.match(membershipSrc, /\/api\/auth\/email\/send/)
    assert.match(membershipSrc, /\/api\/auth\/captcha/)
    assert.match(membershipSrc, /captchaId/)
    assert.match(membershipSrc, /membershipApiUrl/)
    assert.match(parentSrc, /图形验证码/)
    assert.match(parentSrc, /邮箱/)
    assert.match(parentSrc, /sendParentEmail/)
    assert.match(parentSrc, /parentEmailSendMessage/)
    assert.match(parentSrc, /点此刷新图形验证码/)
    assert.match(parentSrc, /重新发送/)
    assert.match(parentSrc, /<details/)
    assert.equal(/腾讯云 SES|SMTP|个人实名/.test(parentSrc), false)
    assert.match(parentSrc, /plans\?\.provider === 'wechat'/)
  })

  it('does not stack Plus prices on the logged-out form', () => {
    const loginBlock = parentSrc.slice(
      parentSrc.indexOf('className="plus-login"'),
      parentSrc.indexOf('className="parent-card-grid"'),
    )
    assert.equal(/包月|包年|请联系管理员/.test(loginBlock), false)
  })
})

describe('parent email send messages', () => {
  it('maps connect failures to plain language', () => {
    assert.equal(isMembershipConnectFailure('Failed to connect to /192.168.2.104:8787'), true)
    assert.equal(
      parentEmailSendMessage({ ok: false, error: 'Failed to connect to /192.168.2.104:8787' }),
      '连不上会员服务，请检查网络后重试',
    )
    assert.equal(parentEmailSendMessage({ ok: true }), '验证码已发到邮箱')
    assert.equal(
      parentEmailSendMessage({ ok: false, error: 'email_ses_not_configured' }),
      '验证码暂时发不出去，请稍后重试',
    )
    assert.equal(parentEmailSendMessage({ ok: false, error: 'auth_ip_rate_limited' }), '该网络发送过于频繁，请稍后再试')
  })
})
