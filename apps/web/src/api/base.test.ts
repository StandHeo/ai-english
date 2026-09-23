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
    assert.equal(PRODUCTION_API_BASE, 'http://118.24.164.40')
    assert.equal(isPrivateLanHost('118.24.164.40'), false)
    assert.equal(isPrivateApiBase(PRODUCTION_API_BASE), false)
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

  it('ignores stored overrides on native and production', () => {
    assert.equal(
      resolveApiBase({
        stored: 'http://192.168.2.104:8787',
        envBase: '',
        native: true,
        prod: true,
      }),
      PRODUCTION_API_BASE,
    )
    assert.equal(
      resolveApiBase({
        stored: 'https://staging.example.com',
        envBase: 'http://10.0.0.2:8787',
        native: true,
        prod: false,
      }),
      PRODUCTION_API_BASE,
    )
  })

  it('allows VITE_API_BASE only in browser dev', () => {
    assert.equal(
      resolveApiBase({
        stored: '',
        envBase: 'http://10.0.0.2:8787',
        native: false,
        prod: false,
      }),
      'http://10.0.0.2:8787',
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
