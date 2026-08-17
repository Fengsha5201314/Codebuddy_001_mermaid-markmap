import { constants } from 'node:fs'
import { access, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const DESKTOP_USER_DATA_DIRECTORY = 'fengsha-diagram-workbench'
const AI_SETTINGS_FILE = 'ai-providers.json'

function hasExplicitUserDataDirectory(argv: string[]) {
  return argv.some((argument) => argument === '--user-data-dir' || argument.startsWith('--user-data-dir='))
}

async function exists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export function resolveDesktopUserDataDirectory(appDataDirectory: string, argv: string[], overrideDirectory?: string) {
  if (overrideDirectory?.trim()) return path.resolve(overrideDirectory.trim())
  if (hasExplicitUserDataDirectory(argv)) return null
  return path.join(appDataDirectory, DESKTOP_USER_DATA_DIRECTORY)
}

export async function migrateLegacyAiSettings(appDataDirectory: string, userDataDirectory: string) {
  const target = path.join(userDataDirectory, AI_SETTINGS_FILE)
  if (await exists(target)) return false

  const legacy = path.join(appDataDirectory, 'Electron', AI_SETTINGS_FILE)
  if (!(await exists(legacy))) return false

  await mkdir(userDataDirectory, { recursive: true })
  try {
    await copyFile(legacy, target, constants.COPYFILE_EXCL)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}
