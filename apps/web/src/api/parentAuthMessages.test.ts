import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PARENT_SEND_SUCCESS,
  classifyMembershipNetworkError,
  parentLoginErrorMessage,
  parentSendErrorMessage,
} from './parentAuthMessages.ts'

describe('parentAuthMessages', () => {
  it('maps Java ConnectException to short Chinese without the raw host', () => {
    const raw = 'Failed to connect to /192.168.2.104:8787'
    assert.equal(classifyMembershipNetworkError(raw), 'network_unreachable')
    assert.equal(parentSendErrorMessage(raw), '连不上会员服务，请检查网络后重试')
    assert.equal(parentSendErrorMessage('network_unreachable'), '连不上会员服务，请检查网络后重试')
    assert.equal(parentSendErrorMessage('java.net.ConnectException'), '连不上会员服务，请检查网络后重试')
    assert.doesNotMatch(parentSendErrorMessage(raw), /192\.168/)
    assert.doesNotMatch(parentSendErrorMessage(raw), /ConnectException/)
  })

  it('keeps known auth errors and never interpolates unknown exceptions', () => {
    assert.equal(parentSendErrorMessage('invalid_email'), '请填写有效邮箱')
    assert.equal(parentSendErrorMessage('captcha_invalid'), '图形验证码错误，请重试')
    assert.equal(parentSendErrorMessage('weird_stack_trace:boom'), '发送失败，请稍后重试')
    assert.equal(parentLoginErrorMessage('invalid_code'), '验证码错误或已过期')
    assert.equal(parentLoginErrorMessage('java.net.ConnectException'), '连不上会员服务，请检查网络后重试')
  })

  it('success copy mentions inbox and spam', () => {
    assert.match(PARENT_SEND_SUCCESS, /邮箱/)
    assert.match(PARENT_SEND_SUCCESS, /垃圾箱/)
  })
})
