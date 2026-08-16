import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { _electron as electron } from 'playwright-core'

const root = process.cwd()
const userData = path.join(root, 'test-results', 'desktop-ai-transport')
const port = '43832'
let application

try {
  await rm(userData, { recursive: true, force: true })
  application = await electron.launch({
    args: [path.join(root, 'dist-electron', 'main.cjs'), `--user-data-dir=${userData}`],
    env: { ...process.env, FENGSHA_DESKTOP_PORT: port },
  })
  const page = await application.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const result = await page.evaluate(async () => {
    const save = await fetch('/api/ai/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        provider: 'cpa',
        baseUrl: 'https://cpa.invalid/v1',
        apiKey: 'fake-desktop-transport-key',
      }),
    })
    const saved = await save.json()
    const models = await fetch('/api/ai/models?provider=cpa', { headers: { Accept: 'application/json' } })
    return {
      saveStatus: save.status,
      configured: saved.providers?.find((provider) => provider.id === 'cpa')?.configured,
      modelStatus: models.status,
      modelError: (await models.json()).error?.code,
    }
  })

  if (result.saveStatus !== 200 || result.configured !== true) {
    throw new Error(`Desktop renderer could not save AI settings: ${JSON.stringify(result)}`)
  }
  if (result.modelStatus !== 502 || result.modelError !== 'AI_UPSTREAM_ERROR') {
    throw new Error(`Desktop renderer did not receive a structured upstream failure: ${JSON.stringify(result)}`)
  }
  const storedSettings = await readFile(path.join(userData, 'ai-providers.json'), 'utf8')
  if (storedSettings.includes('fake-desktop-transport-key') || !storedSettings.includes('electron-safe-storage:v1:')) {
    throw new Error('Desktop API Key was not protected at rest.')
  }
  process.stdout.write(`${JSON.stringify({ ...result, keyProtectedAtRest: true })}\n`)
} finally {
  await application?.close().catch(() => undefined)
  await rm(userData, { recursive: true, force: true }).catch(() => undefined)
}
