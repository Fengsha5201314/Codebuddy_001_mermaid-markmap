import { mkdir, open, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_DESKTOP_PORT = 43_817
const ORIGIN_STATE_FILE = 'desktop-origin.json'
const MAX_LEVELDB_TAIL_BYTES = 4 * 1024 * 1024
const MAX_LEVELDB_FILES = 8

function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1024 && value <= 65_535
}

function requestedPort(value?: string) {
  if (!value?.trim()) return null
  const parsed = Number(value)
  return validPort(parsed) ? parsed : null
}

async function readPersistedPort(userDataDirectory: string) {
  try {
    const state = JSON.parse(await readFile(path.join(userDataDirectory, ORIGIN_STATE_FILE), 'utf8')) as { port?: unknown }
    return validPort(state.port) ? state.port : null
  } catch {
    return null
  }
}

async function readTail(filePath: string, size: number) {
  const length = Math.min(size, MAX_LEVELDB_TAIL_BYTES)
  const buffer = Buffer.alloc(length)
  const handle = await open(filePath, 'r')
  try {
    await handle.read(buffer, 0, length, Math.max(0, size - length))
    return buffer.toString('latin1')
  } finally {
    await handle.close()
  }
}

async function findLegacyPort(userDataDirectory: string) {
  const levelDbDirectory = path.join(userDataDirectory, 'Local Storage', 'leveldb')
  try {
    const entries = await readdir(levelDbDirectory, { withFileTypes: true })
    const candidates = await Promise.all(entries
      .filter((entry) => entry.isFile() && /\.(?:log|ldb)$/i.test(entry.name))
      .map(async (entry) => {
        const filePath = path.join(levelDbDirectory, entry.name)
        const details = await stat(filePath)
        return { filePath, modified: details.mtimeMs, size: details.size }
      }))
    candidates.sort((left, right) => right.modified - left.modified)

    for (const candidate of candidates.slice(0, MAX_LEVELDB_FILES)) {
      const content = await readTail(candidate.filePath, candidate.size)
      const matches = [...content.matchAll(/http:\/\/127\.0\.0\.1:(\d{4,5})/g)]
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const port = Number(matches[index][1])
        if (validPort(port)) return port
      }
    }
  } catch {
    // A new profile does not have a Local Storage database yet.
  }
  return null
}

async function persistPort(userDataDirectory: string, port: number) {
  await mkdir(userDataDirectory, { recursive: true })
  const target = path.join(userDataDirectory, ORIGIN_STATE_FILE)
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify({ port }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, target)
}

export async function resolveDesktopPort(userDataDirectory: string, requestedValue?: string) {
  const explicit = requestedPort(requestedValue)
  if (explicit) return explicit

  const persisted = await readPersistedPort(userDataDirectory)
  if (persisted) return persisted

  const port = await findLegacyPort(userDataDirectory) ?? DEFAULT_DESKTOP_PORT
  await persistPort(userDataDirectory, port)
  return port
}
