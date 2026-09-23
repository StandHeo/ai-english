import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))
const pages = join(dir, '..', 'pages')
const membershipSrc = readFileSync(join(dir, 'membership.ts'), 'utf8')
const parentSrc = readFileSync(join(pages, 'ParentPage.tsx'), 'utf8')
const parentCss = readFileSync(join(pages, 'parent.css'), 'utf8')
const parentMsgSrc = readFileSync(join(dir, 'parentAuthMessage.ts'), 'utf8')
const baseSrc = readFileSync(join(dir, 'base.ts'), 'utf8')

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
  it('keeps login first and a short Plus line', () => {
    assert.match(parentSrc, /Plus 解锁家庭日记/)
    assert.match(parentSrc, /发送验证码/)
    assert.match(parentSrc, /注销账号/)
    assert.match(parentSrc, /验证码已发送到邮箱/)
    assert.equal(/不含第三方模型调用费|腾讯云 SES|个人实名|SMTP/.test(parentSrc), false)
  })

  it('keeps suggested starter prices as fen', () => {
    assert.match(membershipSrc, /priceFen: 1800/)
    assert.match(membershipSrc, /priceFen: 14800/)
    assert.match(membershipSrc, /¥\$\{/)
  })

  it('shows captcha fields when config.captcha is on', () => {
    assert.match(membershipSrc, /\/api\/auth\/config/)
    assert.match(membershipSrc, /\/api\/auth\/email\/send/)
    assert.match(membershipSrc, /\/api\/auth\/captcha/)
    assert.match(membershipSrc, /captchaId/)
    assert.match(parentSrc, /captchaOn/)
    assert.match(parentSrc, /图形验证码/)
    assert.match(parentSrc, /fetchAuthConfig/)
    assert.match(parentCss, /\.plus-captcha/)
  })

  it('maps send errors without dumping ConnectException', () => {
    assert.match(parentSrc, /parentSendErrorMessage/)
    assert.match(parentMsgSrc, /cannot_reach_server/)
    assert.match(parentMsgSrc, /auth_ip_rate_limited/)
    assert.match(parentMsgSrc, /email_ses_not_configured/)
    assert.equal(/发送失败：\$\{res\.error/.test(parentSrc), false)
  })
})

describe('native production API default', () => {
  it('points Capacitor/production builds at the temporary lighthouse IP', () => {
    assert.match(baseSrc, /PRODUCTION_API_BASE = 'http:\/\/118\.24\.164\.40'/)
    assert.equal(/PRODUCTION_API_BASE = 'https:\/\/tudoudou-ai\.site'/.test(baseSrc), false)
    assert.match(membershipSrc, /recoverFromUnreachablePrivateBase/)
  })
})
