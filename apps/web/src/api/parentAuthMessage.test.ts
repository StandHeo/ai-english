import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parentSendErrorMessage,
  parentVerifyErrorMessage,
  sanitizeMembershipError,
} from './parentAuthMessage.ts'

describe('sanitizeMembershipError', () => {
  it('maps ConnectException dumps to cannot_reach_server', () => {
    assert.equal(
      sanitizeMembershipError('Failed to connect to /192.168.2.104:8787'),
      'cannot_reach_server',
    )
    assert.equal(
      sanitizeMembershipError('java.net.ConnectException: Failed to connect to /192.168.2.104:8787'),
      'cannot_reach_server',
    )
  })

  it('keeps structured API errors', () => {
    assert.equal(sanitizeMembershipError('captcha_invalid'), 'captcha_invalid')
    assert.equal(sanitizeMembershipError('email_rate_limited'), 'email_rate_limited')
  })
})

describe('parentSendErrorMessage', () => {
  it('never shows raw OkHttp / ConnectException text', () => {
    const msg = parentSendErrorMessage('Failed to connect to /192.168.2.104:8787')
    assert.equal(msg, '连不上服务器，请检查网络后重试')
    assert.equal(/ConnectException|Failed to connect|192\.168/.test(msg), false)
  })

  it('maps rate limit, captcha, and email failures to one sentence', () => {
    assert.equal(parentSendErrorMessage('email_rate_limited'), '发送太频繁，请稍后再试')
    assert.equal(parentSendErrorMessage('captcha_invalid'), '图形验证码错误，请重试')
    assert.equal(parentSendErrorMessage('email_ses_not_configured'), '邮件暂时发不出去，请稍后重试')
    assert.equal(
      parentSendErrorMessage('email_ses_failed:UserNotFound'),
      '邮件暂时发不出去，请稍后重试',
    )
  })
})

describe('parentVerifyErrorMessage', () => {
  it('maps invalid code and network dumps', () => {
    assert.equal(parentVerifyErrorMessage('invalid_code'), '验证码错误或已过期')
    assert.equal(
      parentVerifyErrorMessage('java.net.ConnectException: Failed to connect'),
      '连不上服务器，请检查网络后重试',
    )
    assert.equal(/ConnectException/.test(parentVerifyErrorMessage('java.net.ConnectException')), false)
  })
})
