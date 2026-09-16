import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const pages = join(here, '..', 'pages')
const membershipSrc = readFileSync(join(here, 'membership.ts'), 'utf8')
const parentPageSrc = readFileSync(join(pages, 'ParentPage.tsx'), 'utf8')
const parentAuthSrc = readFileSync(join(here, 'parentAuthMessages.ts'), 'utf8')
const apiBaseSrc = readFileSync(join(here, 'apiBase.ts'), 'utf8')

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
  it('states Plus excludes model fees without ops notes', () => {
    assert.match(parentPageSrc, /不含模型调用费/)
    assert.match(parentPageSrc, /发送验证码/)
    assert.match(parentPageSrc, /注销账号/)
    assert.doesNotMatch(parentPageSrc, /腾讯云 SES/)
    assert.doesNotMatch(parentPageSrc, /SMTP/)
    assert.doesNotMatch(parentPageSrc, /发送失败：\$\{/)
  })

  it('keeps suggested starter prices as fen', () => {
    assert.match(membershipSrc, /priceFen: 1800/)
    assert.match(membershipSrc, /priceFen: 14800/)
    assert.match(membershipSrc, /¥\$\{/)
  })

  it('shows captcha before send and maps network errors to short Chinese', () => {
    assert.match(membershipSrc, /\/api\/auth\/config/)
    assert.match(membershipSrc, /\/api\/auth\/email\/send/)
    assert.match(membershipSrc, /\/api\/auth\/captcha/)
    assert.match(membershipSrc, /captchaId/)
    assert.match(membershipSrc, /classifyMembershipNetworkError/)
    assert.match(parentPageSrc, /图形验证码/)
    assert.match(parentPageSrc, /换一张/)
    assert.match(parentPageSrc, /秒后可重发/)
    assert.match(parentPageSrc, /const \[captchaOn, setCaptchaOn\] = useState\(true\)/)
    assert.match(parentPageSrc, /parentNetworkHint/)
    assert.match(parentAuthSrc, /auth_ip_rate_limited/)
    assert.match(parentAuthSrc, /email_ses_not_configured/)
    assert.match(parentAuthSrc, /垃圾箱/)
  })

  it('native membership API defaults to production origin', () => {
    assert.match(apiBaseSrc, /https:\/\/tudoudou-ai\.site/)
    assert.match(apiBaseSrc, /ai-english-api-base-v2/)
    assert.match(apiBaseSrc, /ai-english-api-base-v1/)
  })
})
