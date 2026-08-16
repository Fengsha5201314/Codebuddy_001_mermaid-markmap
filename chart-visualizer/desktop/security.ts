import type { IncomingHttpHeaders } from 'node:http'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

export function resolveDevelopmentRendererUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    if (parsed.username || parsed.password || !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) return null
    return parsed.href
  } catch {
    return null
  }
}

export function isSameOriginNavigation(targetUrl: string, rendererUrl: string): boolean {
  try {
    return new URL(targetUrl).origin === new URL(rendererUrl).origin
  } catch {
    return false
  }
}

export function isTrustedLocalRequest(
  headers: IncomingHttpHeaders,
  expectedOrigin: string,
  method = 'GET',
): boolean {
  let expected: URL
  try {
    expected = new URL(expectedOrigin)
  } catch {
    return false
  }

  if (headers.host !== expected.host) return false

  const fetchSite = Array.isArray(headers['sec-fetch-site'])
    ? headers['sec-fetch-site'][0]
    : headers['sec-fetch-site']
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false

  const origin = Array.isArray(headers.origin) ? headers.origin[0] : headers.origin
  if (origin) {
    try {
      if (new URL(origin).origin !== expected.origin) return false
    } catch {
      return false
    }
  }

  // Chromium sends Origin for renderer mutations. Requiring it prevents a
  // cross-site form or blind request from changing local AI settings.
  if (!['GET', 'HEAD'].includes(method.toUpperCase()) && !origin) return false
  return true
}
