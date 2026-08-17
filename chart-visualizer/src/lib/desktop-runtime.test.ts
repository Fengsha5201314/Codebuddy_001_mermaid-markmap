import { afterEach, describe, expect, it, vi } from 'vitest'
import packageInfo from '../../package.json'
import {
  checkForUpdates,
  getAppInfo,
  getUpdateState,
  installUpdate,
  closeDesktopWindow,
  confirmDesktopClose,
  onDesktopCloseRequested,
  onUpdateState,
  type AppInfo,
  type UpdateState,
} from './desktop-runtime'

afterEach(() => {
  delete window.fengshaDesktop
})

describe('desktop runtime bridge', () => {
  it('keeps a complete web fallback when Electron is absent', async () => {
    await expect(getAppInfo()).resolves.toMatchObject({ desktop: false, platform: 'web', version: packageInfo.version })
    await expect(getUpdateState()).resolves.toMatchObject({ status: 'web', currentVersion: packageInfo.version })
    await expect(checkForUpdates()).resolves.toMatchObject({ status: 'web' })
    await expect(installUpdate()).resolves.toBe(false)
    expect(onUpdateState(() => undefined)).toBeTypeOf('function')
    await expect(confirmDesktopClose(false)).resolves.toBe('save')
    expect(onDesktopCloseRequested(() => undefined)).toBeTypeOf('function')
    expect(() => closeDesktopWindow()).not.toThrow()
  })

  it('delegates version and update actions to the isolated desktop bridge', async () => {
    const appInfo: AppInfo = {
      desktop: true,
      packaged: true,
      name: '风沙图表工作台',
      version: '1.1.0',
      platform: 'win32',
      releasesUrl: 'https://example.com/releases',
    }
    const update: UpdateState = {
      status: 'downloaded',
      currentVersion: '1.1.0',
      availableVersion: '1.2.0',
      progress: 100,
      message: 'ready',
    }
    const cleanup = vi.fn()
    const install = vi.fn(async () => true)
    const closeNow = vi.fn()
    const closeCleanup = vi.fn()
    window.fengshaDesktop = {
      getAppInfo: vi.fn(async () => appInfo),
      getUpdateState: vi.fn(async () => update),
      checkForUpdates: vi.fn(async () => update),
      installUpdate: install,
      confirmClose: vi.fn(async () => 'discard' as const),
      closeNow,
      onCloseRequested: vi.fn(() => closeCleanup),
      onUpdateState: vi.fn(() => cleanup),
    }

    await expect(getAppInfo()).resolves.toEqual(appInfo)
    await expect(getUpdateState()).resolves.toEqual(update)
    await expect(checkForUpdates()).resolves.toEqual(update)
    await expect(installUpdate()).resolves.toBe(true)
    expect(install).toHaveBeenCalledOnce()
    expect(onUpdateState(() => undefined)).toBe(cleanup)
    await expect(confirmDesktopClose(true)).resolves.toBe('discard')
    expect(onDesktopCloseRequested(() => undefined)).toBe(closeCleanup)
    closeDesktopWindow()
    expect(closeNow).toHaveBeenCalledOnce()
  })
})
