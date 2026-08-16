import { rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createServer } from 'vite'

const root = process.cwd()
const directory = path.join(root, 'test-results', 'web-ai-transport')
const settingsFile = path.join(directory, 'ai-providers.json')
const previousSettingsFile = process.env.AI_SETTINGS_FILE
process.env.AI_SETTINGS_FILE = settingsFile
let server

try {
  await rm(directory, { recursive: true, force: true })
  server = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 43833, strictPort: true },
  })
  await server.listen()
  const origin = 'http://127.0.0.1:43833'
  const save = await fetch(`${origin}/api/ai/settings`, {
    method: 'PUT',
    headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'cpa', baseUrl: 'https://cpa.invalid/v1', apiKey: 'fake-web-transport-key' }),
  })
  const body = await save.json()
  if (save.status !== 200 || body.providers?.find((provider) => provider.id === 'cpa')?.configured !== true) {
    throw new Error(`Web development transport failed: ${JSON.stringify({ status: save.status, body })}`)
  }
  process.stdout.write(`${JSON.stringify({ saveStatus: save.status, configured: true })}\n`)
} finally {
  await server?.close()
  await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  if (previousSettingsFile === undefined) delete process.env.AI_SETTINGS_FILE
  else process.env.AI_SETTINGS_FILE = previousSettingsFile
}
