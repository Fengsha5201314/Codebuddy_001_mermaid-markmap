import { describe, expect, it } from 'vitest'
import {
  isSameOriginNavigation,
  isTrustedLocalRequest,
  resolveDevelopmentRendererUrl,
} from './security.ts'

describe('desktop security boundaries', () => {
  it('only accepts loopback development renderer URLs', () => {
    expect(resolveDevelopmentRendererUrl('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173/')
    expect(resolveDevelopmentRendererUrl('http://localhost:5173/app')).toBe('http://localhost:5173/app')
    expect(resolveDevelopmentRendererUrl('https://example.com/app')).toBeNull()
    expect(resolveDevelopmentRendererUrl('file:///tmp/app.html')).toBeNull()
    expect(resolveDevelopmentRendererUrl('http://user:pass@localhost:5173')).toBeNull()
  })

  it('compares navigation URLs by parsed origin rather than string prefix', () => {
    expect(isSameOriginNavigation('http://127.0.0.1:43817/project/1', 'http://127.0.0.1:43817/')).toBe(true)
    expect(isSameOriginNavigation('http://127.0.0.1:438170/attack', 'http://127.0.0.1:43817/')).toBe(false)
    expect(isSameOriginNavigation('https://example.com', 'http://127.0.0.1:43817/')).toBe(false)
  })

  it('rejects DNS-rebinding hosts, cross-site fetches, and originless mutations', () => {
    const expected = 'http://127.0.0.1:43817'
    expect(isTrustedLocalRequest({ host: '127.0.0.1:43817', origin: expected, 'sec-fetch-site': 'same-origin' }, expected, 'PUT')).toBe(true)
    expect(isTrustedLocalRequest({ host: 'attacker.example', origin: 'http://attacker.example' }, expected, 'PUT')).toBe(false)
    expect(isTrustedLocalRequest({ host: '127.0.0.1:43817', origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }, expected, 'POST')).toBe(false)
    expect(isTrustedLocalRequest({ host: '127.0.0.1:43817' }, expected, 'POST')).toBe(false)
    expect(isTrustedLocalRequest({ host: '127.0.0.1:43817' }, expected, 'GET')).toBe(true)
  })
})
