import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PRODUCTION_API_BASE,
  hostnameOfApiBase,
  isApiUnreachableError,
  isOfficialApiBase,
  isPrivateApiBase,
  isPrivateLanHost,
  resolveApiBase,
} from './base.ts'

describe('private LAN API hosts', () => {
  it('flags 192.168, 10., 127., localhost, and 172.16–31', () => {
    assert.equal(isPrivateLanHost('192.168.2.104'), true)
    assert.equal(isPrivateLanHost('10.0.0.8'), true)
    assert.equal(isPrivateLanHost('127.0.0.1'), true)
    assert.equal(isPrivateLanHost('localhost'), true)
    assert.equal(isPrivateLanHost('172.16.1.2'), true)
    assert.equal(isPrivateLanHost('172.31.255.1'), true)
  })

  it('does not flag the production site or public IPs', () => {
    assert.equal(isPrivateLanHost('tudoudou-ai.site'), false)
    assert.equal(isPrivateLanHost('8.8.8.8'), false)
    assert.equal(isPrivateLanHost('172.32.0.1'), false)
    assert.equal(isPrivateApiBase('https://tudoudou-ai.site'), false)
    assert.equal(isPrivateApiBase('http://192.168.2.104:8787'), true)
    assert.equal(hostnameOfApiBase('http://192.168.2.104:8787'), '192.168.2.104')
  })
})

describe('resolveApiBase', () => {
  it('uses Vite same-origin proxy in browser dev when nothing is set', () => {
    assert.equal(
      resolveApiBase({ stored: '', envBase: '', native: false, prod: false }),
      '',
    )
  })

  it('defaults native and production web to the live site', () => {
    assert.equal(
      resolveApiBase({ stored: '', envBase: '', native: true, prod: false }),
      PRODUCTION_API_BASE,
    )
    assert.equal(
      resolveApiBase({ stored: '', envBase: '', native: false, prod: true }),
      PRODUCTION_API_BASE,
    )
    assert.equal(isOfficialApiBase(PRODUCTION_API_BASE), true)
  })

  it('keeps an explicit debug override (settings or VITE_API_BASE)', () => {
    assert.equal(
      resolveApiBase({
        stored: 'http://192.168.2.104:8787',
        envBase: '',
        native: true,
        prod: true,
      }),
      'http://192.168.2.104:8787',
    )
    assert.equal(
      resolveApiBase({
        stored: '',
        envBase: 'http://10.0.0.2:8787',
        native: true,
        prod: true,
      }),
      'http://10.0.0.2:8787',
    )
  })

  it('skips stale private IPs and falls back to production', () => {
    assert.equal(
      resolveApiBase({
        stored: 'http://192.168.2.104:8787',
        envBase: 'http://127.0.0.1:8787',
        native: true,
        prod: true,
        skipPrivate: true,
      }),
      PRODUCTION_API_BASE,
    )
  })

  it('does not skip a public custom override even when skipPrivate is set', () => {
    assert.equal(
      resolveApiBase({
        stored: 'https://staging.example.com',
        envBase: '',
        native: true,
        prod: true,
        skipPrivate: true,
      }),
      'https://staging.example.com',
    )
  })
})

describe('isApiUnreachableError', () => {
  it('matches Android OkHttp / ConnectException dumps', () => {
    assert.equal(isApiUnreachableError('Failed to connect to /192.168.2.104:8787'), true)
    assert.equal(
      isApiUnreachableError('java.net.ConnectException: Failed to connect to /192.168.2.104:8787'),
      true,
    )
    assert.equal(isApiUnreachableError('llm_timeout'), true)
  })

  it('rejects ordinary API error codes', () => {
    assert.equal(isApiUnreachableError('captcha_invalid'), false)
    assert.equal(isApiUnreachableError('invalid_email'), false)
  })
})
