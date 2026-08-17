import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_DESKTOP_PORT, resolveDesktopPort } from './origin.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function temporaryUserData() {
  const directory = await mkdtemp(path.join(tmpdir(), 'fengsha-origin-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('desktop origin persistence', () => {
  it('uses an explicit test port without changing the persistent origin', async () => {
    const userData = await temporaryUserData()
    await expect(resolveDesktopPort(userData, '43843')).resolves.toBe(43843)
  })

  it('recovers the most recently used legacy loopback origin and then keeps it stable', async () => {
    const userData = await temporaryUserData()
    const levelDb = path.join(userData, 'Local Storage', 'leveldb')
    await mkdir(levelDb, { recursive: true })
    const older = path.join(levelDb, '000001.ldb')
    const newest = path.join(levelDb, '000002.log')
    await writeFile(older, 'http://127.0.0.1:43817', 'latin1')
    await writeFile(newest, 'http://127.0.0.1:60199\u0000http://127.0.0.1:49372', 'latin1')
    await utimes(older, new Date('2026-01-01'), new Date('2026-01-01'))
    await utimes(newest, new Date('2026-01-02'), new Date('2026-01-02'))

    await expect(resolveDesktopPort(userData)).resolves.toBe(49372)
    await writeFile(newest, 'http://127.0.0.1:55555', 'latin1')
    await expect(resolveDesktopPort(userData)).resolves.toBe(49372)
  })

  it('uses a stable default for a new profile', async () => {
    const userData = await temporaryUserData()
    await expect(resolveDesktopPort(userData)).resolves.toBe(DEFAULT_DESKTOP_PORT)
    await expect(resolveDesktopPort(userData)).resolves.toBe(DEFAULT_DESKTOP_PORT)
  })
})
