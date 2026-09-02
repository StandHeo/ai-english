import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCloudTimeoutMessage } from './cloudTimeout.ts'

describe('isCloudTimeoutMessage', () => {
  it('matches Capacitor / OkHttp timeout shapes from Android logcat', () => {
    assert.equal(isCloudTimeoutMessage('timeout'), true)
    assert.equal(isCloudTimeoutMessage('java.net.SocketTimeoutException: timeout'), true)
    assert.equal(isCloudTimeoutMessage('Socket closed'), true)
    assert.equal(isCloudTimeoutMessage('llm_timeout'), true)
    assert.equal(isCloudTimeoutMessage('The operation was aborted'), true)
    assert.equal(isCloudTimeoutMessage('ETIMEDOUT'), true)
    assert.equal(isCloudTimeoutMessage('Software caused connection abort'), true)
    assert.equal(
      isCloudTimeoutMessage('agnes_image_http_0:Software caused connection abort'),
      true,
    )
  })

  it('rejects unrelated errors', () => {
    assert.equal(isCloudTimeoutMessage('http_401'), false)
    assert.equal(isCloudTimeoutMessage('agnes_image_http_429:rate'), false)
    assert.equal(isCloudTimeoutMessage('missing_api_base'), false)
  })
})
