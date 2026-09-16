import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PRODUCT_MEMBERSHIP_ORIGIN,
  isPrivateOrLocalApiBase,
  resolveMembershipApiBase,
} from './base.ts'

describe('membership API base', () => {
  it('treats loopback and RFC1918 as private', () => {
    assert.equal(isPrivateOrLocalApiBase('http://192.168.2.104:8787'), true)
    assert.equal(isPrivateOrLocalApiBase('http://10.0.0.8:8787'), true)
    assert.equal(isPrivateOrLocalApiBase('http://169.254.1.1:8787'), true)
    assert.equal(isPrivateOrLocalApiBase('http://172.31.255.1:8787'), true)
    assert.equal(isPrivateOrLocalApiBase('http://172.15.0.1:8787'), false)
    assert.equal(isPrivateOrLocalApiBase('http://localhost:8787'), true)
    assert.equal(isPrivateOrLocalApiBase('http://127.0.0.1:8787'), true)
    assert.equal(isPrivateOrLocalApiBase('http://host.local:8787'), true)
    assert.equal(isPrivateOrLocalApiBase('https://tudoudou-ai.site'), false)
    assert.equal(isPrivateOrLocalApiBase('https://staging.example.com'), false)
  })

  it('uses product origin on native with no override', () => {
    assert.equal(
      resolveMembershipApiBase({ stored: '', envBase: '', native: true }),
      PRODUCT_MEMBERSHIP_ORIGIN,
    )
    assert.equal(PRODUCT_MEMBERSHIP_ORIGIN, 'https://tudoudou-ai.site')
    assert.equal(PRODUCT_MEMBERSHIP_ORIGIN.endsWith('/'), false)
  })

  it('ignores stored LAN for membership on native', () => {
    assert.equal(
      resolveMembershipApiBase({
        stored: 'http://192.168.2.104:8787',
        envBase: '',
        native: true,
      }),
      PRODUCT_MEMBERSHIP_ORIGIN,
    )
    assert.equal(
      resolveMembershipApiBase({
        stored: '',
        envBase: 'http://192.168.2.104:8787',
        native: true,
      }),
      PRODUCT_MEMBERSHIP_ORIGIN,
    )
  })

  it('keeps empty base in browser so Vite can proxy', () => {
    assert.equal(resolveMembershipApiBase({ stored: '', envBase: '', native: false }), '')
    assert.equal(
      resolveMembershipApiBase({
        stored: '',
        envBase: 'http://localhost:8787',
        native: false,
      }),
      'http://localhost:8787',
    )
  })

  it('allows public HTTPS override', () => {
    assert.equal(
      resolveMembershipApiBase({
        stored: 'https://staging.example.com',
        envBase: '',
        native: true,
      }),
      'https://staging.example.com',
    )
  })
})
