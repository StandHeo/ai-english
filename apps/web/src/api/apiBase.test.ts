import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PRODUCTION_API_BASE,
  isPrivateLanApiBase,
  normalizeApiBase,
  resolveApiBase,
} from './apiBase.ts'

describe('apiBase', () => {
  it('strips trailing slash so /api paths do not double', () => {
    assert.equal(normalizeApiBase('https://tudoudou-ai.site/'), PRODUCTION_API_BASE)
    assert.equal(`${normalizeApiBase('https://tudoudou-ai.site/')}/api/auth/email/send`, `${PRODUCTION_API_BASE}/api/auth/email/send`)
  })

  it('treats RFC1918 and localhost as LAN debug hosts', () => {
    assert.equal(isPrivateLanApiBase('http://192.168.2.104:8787'), true)
    assert.equal(isPrivateLanApiBase('http://10.0.0.8:8787'), true)
    assert.equal(isPrivateLanApiBase('http://172.16.1.2:8787'), true)
    assert.equal(isPrivateLanApiBase('http://localhost:8787'), true)
    assert.equal(isPrivateLanApiBase(PRODUCTION_API_BASE), false)
  })

  it('native defaults to production when stored/env empty or LAN', () => {
    assert.equal(resolveApiBase({ stored: '', env: '', native: true }), PRODUCTION_API_BASE)
    assert.equal(
      resolveApiBase({ stored: '', env: 'http://192.168.2.104:8787', native: true }),
      PRODUCTION_API_BASE,
    )
  })

  it('native keeps explicit settings override including LAN debug', () => {
    assert.equal(
      resolveApiBase({ stored: 'http://192.168.1.23:8787', env: '', native: true }),
      'http://192.168.1.23:8787',
    )
  })

  it('browser keeps empty env so Vite same-origin proxy is used', () => {
    assert.equal(resolveApiBase({ stored: '', env: '', native: false }), '')
    assert.equal(
      resolveApiBase({ stored: '', env: 'http://192.168.2.104:8787', native: false }),
      'http://192.168.2.104:8787',
    )
  })

  it('native may use a non-LAN env base', () => {
    assert.equal(
      resolveApiBase({ stored: '', env: 'https://staging.tudoudou-ai.site', native: true }),
      'https://staging.tudoudou-ai.site',
    )
  })
})
