import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const pages = join(dirname(fileURLToPath(import.meta.url)), '..', 'pages')
const membershipSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'membership.ts'), 'utf8')

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
    const src = readFileSync(join(pages, 'ParentPage.tsx'), 'utf8')
    assert.match(src, /不含第三方模型调用费/)
    assert.match(src, /发送验证码/)
    assert.match(src, /注销账号/)
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
    const src = readFileSync(join(pages, 'ParentPage.tsx'), 'utf8')
    assert.match(src, /图形验证码/)
    assert.match(src, /auth_ip_rate_limited/)
    assert.match(src, /邮箱/)
    assert.match(src, /sendParentEmail/)
    assert.match(src, /腾讯云 SES/)
    assert.match(src, /email_ses_not_configured/)
  })
})
