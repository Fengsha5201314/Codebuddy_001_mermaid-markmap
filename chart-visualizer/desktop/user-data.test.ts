import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateLegacyAiSettings, resolveDesktopUserDataDirectory } from './user-data.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('desktop user data', () => {
  it('uses the installed application directory during ordinary development launches', () => {
    expect(resolveDesktopUserDataDirectory('C:\\Users\\tester\\AppData\\Roaming', ['electron', 'dist-electron/main.cjs']))
      .toBe(path.join('C:\\Users\\tester\\AppData\\Roaming', 'fengsha-diagram-workbench'))
  })

  it('preserves an explicit isolated user-data directory for e2e runs', () => {
    expect(resolveDesktopUserDataDirectory('C:\\Users\\tester\\AppData\\Roaming', ['electron', '--user-data-dir=C:\\Temp\\fengsha-e2e']))
      .toBeNull()
  })

  it('allows an explicit environment override without falling back to Electron data', () => {
    expect(resolveDesktopUserDataDirectory('C:\\Users\\tester\\AppData\\Roaming', ['electron'], 'C:\\Temp\\fengsha-e2e'))
      .toBe(path.resolve('C:\\Temp\\fengsha-e2e'))
  })

  it('migrates legacy Electron AI settings once without overwriting current settings', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fengsha-user-data-'))
    temporaryDirectories.push(root)
    const legacyDirectory = path.join(root, 'Electron')
    const currentDirectory = path.join(root, 'fengsha-diagram-workbench')
    await mkdir(legacyDirectory, { recursive: true })
    await writeFile(path.join(legacyDirectory, 'ai-providers.json'), '{"source":"legacy"}', 'utf8')

    await migrateLegacyAiSettings(root, currentDirectory)
    expect(await readFile(path.join(currentDirectory, 'ai-providers.json'), 'utf8')).toBe('{"source":"legacy"}')

    await writeFile(path.join(currentDirectory, 'ai-providers.json'), '{"source":"current"}', 'utf8')
    await migrateLegacyAiSettings(root, currentDirectory)
    expect(await readFile(path.join(currentDirectory, 'ai-providers.json'), 'utf8')).toBe('{"source":"current"}')
  })
})
