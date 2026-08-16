import { describe, expect, it } from 'vitest'
import {
  BUNDLED_DRAWIO_VERSION,
  getOnlineFallback,
  resolveDrawioRuntime,
} from '@/lib/drawio-runtime'

describe('draw.io runtime selection', () => {
  const hostUrl = 'http://127.0.0.1:43817/workspace'

  it('defaults local assets to the application origin', () => {
    const runtime = resolveDrawioRuntime('local', hostUrl)
    expect(runtime).toMatchObject({
      mode: 'local',
      editorUrl: 'http://127.0.0.1:43817/drawio/',
      requiresNetwork: false,
    })
    expect(runtime.label).toContain(BUNDLED_DRAWIO_VERSION)
  })

  it('keeps the official endpoint as an explicit online adapter', () => {
    expect(resolveDrawioRuntime('online', hostUrl)).toMatchObject({
      mode: 'online',
      editorUrl: 'https://embed.diagrams.net/',
      requiresNetwork: true,
    })
  })

  it('only falls back from local when the user allows it', () => {
    const local = resolveDrawioRuntime('local', hostUrl)
    const online = resolveDrawioRuntime('online', hostUrl)
    expect(getOnlineFallback(local, false, hostUrl)).toBeUndefined()
    expect(getOnlineFallback(local, true, hostUrl)?.mode).toBe('online')
    expect(getOnlineFallback(online, true, hostUrl)).toBeUndefined()
  })
})
